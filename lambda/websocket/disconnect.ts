/**
 * WebSocket $disconnect handler
 *
 * Removes the CONN# item for the disconnected connection.
 * If the disconnecting player was mid-game, broadcasts PLAYER_LEFT.
 * If the host disconnects, marks the room as ended and notifies all players.
 * TV connections are silently cleaned up.
 */

import { APIGatewayProxyResultV2, APIGatewayProxyWebsocketEventV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  DeleteCommand,
  QueryCommand,
  UpdateCommand,
  GetCommand,
} from '@aws-sdk/lib-dynamodb';
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { ServerAction, WsMessage, ConnectionRole } from '../shared/types';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const GAMES_TABLE = process.env.GAMES_TABLE!;

function apigwClient(domainName: string, stage: string) {
  return new ApiGatewayManagementApiClient({ endpoint: `https://${domainName}/${stage}` });
}

async function broadcast(
  apigw: ApiGatewayManagementApiClient,
  connections: { connId: string }[],
  action: ServerAction,
  payload: unknown,
  excludeConn?: string
) {
  const msg: WsMessage = { action, payload };
  const data = Buffer.from(JSON.stringify(msg));
  await Promise.allSettled(
    connections
      .filter(c => c.connId !== excludeConn)
      .map(c => apigw.send(new PostToConnectionCommand({ ConnectionId: c.connId, Data: data })))
  );
}

export const handler = async (
  event: APIGatewayProxyWebsocketEventV2
): Promise<APIGatewayProxyResultV2> => {
  const connId = event.requestContext.connectionId;
  const { domainName, stage } = event.requestContext;

  const connResult = await ddb.send(new QueryCommand({
    TableName: GAMES_TABLE,
    IndexName: 'ConnIdIndex',
    KeyConditionExpression: 'connId = :c',
    ExpressionAttributeValues: { ':c': connId },
  }));
  const connItem = connResult.Items?.[0];
  if (!connItem) return { statusCode: 200, body: 'OK' };

  const { roomCode } = connItem;
  const role: ConnectionRole = connItem.role ?? (connItem.isHost ? 'host' : 'player');
  const apigw = apigwClient(domainName, stage);

  // TV disconnects — silently clean up
  if (role === 'tv') {
    await ddb.send(new DeleteCommand({
      TableName: GAMES_TABLE,
      Key: { PK: `ROOM#${roomCode}`, SK: `CONN#${connId}` },
    }));
    return { statusCode: 200, body: 'OK' };
  }

  // Fetch room META (needed for both host and player disconnect logic)
  const meta = await ddb.send(new GetCommand({
    TableName: GAMES_TABLE,
    Key: { PK: `ROOM#${roomCode}`, SK: 'META' },
  }));

  if (role === 'host') {
    if (meta.Item?.status !== 'active') {
      // Lobby or ended — delete host record and mark room ended
      await ddb.send(new DeleteCommand({
        TableName: GAMES_TABLE,
        Key: { PK: `ROOM#${roomCode}`, SK: `CONN#${connId}` },
      }));
      await ddb.send(new UpdateCommand({
        TableName: GAMES_TABLE,
        Key: { PK: `ROOM#${roomCode}`, SK: 'META' },
        UpdateExpression: 'SET #s = :s',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: { ':s': 'ended' },
      }));
      return { statusCode: 200, body: 'OK' };
    }

    // Active game — mark host as disconnected so they can reconnect.
    // Do NOT end the room; the host's client will auto-reconnect within seconds.
    await ddb.send(new UpdateCommand({
      TableName: GAMES_TABLE,
      Key: { PK: `ROOM#${roomCode}`, SK: `CONN#${connId}` },
      UpdateExpression: 'SET disconnected = :t',
      ExpressionAttributeValues: { ':t': true },
    }));
    return { statusCode: 200, body: 'OK' };
  }

  // Player disconnect — check game state

  if (meta.Item?.status !== 'active') {
    // Lobby or ended — safe to delete immediately, nothing to preserve
    await ddb.send(new DeleteCommand({
      TableName: GAMES_TABLE,
      Key: { PK: `ROOM#${roomCode}`, SK: `CONN#${connId}` },
    }));
    return { statusCode: 200, body: 'OK' };
  }

  // Active game — mark as disconnected to preserve score for reconnect
  await ddb.send(new UpdateCommand({
    TableName: GAMES_TABLE,
    Key: { PK: `ROOM#${roomCode}`, SK: `CONN#${connId}` },
    UpdateExpression: 'SET disconnected = :t',
    ExpressionAttributeValues: { ':t': true },
  }));

  // Get remaining live connections for broadcast (exclude the just-disconnected player)
  const connsResult = await ddb.send(new QueryCommand({
    TableName: GAMES_TABLE,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
    ExpressionAttributeValues: { ':pk': `ROOM#${roomCode}`, ':skPrefix': 'CONN#' },
  }));
  const liveConns = ((connsResult.Items ?? []) as { connId: string; disconnected?: boolean }[])
    .filter(c => !c.disconnected);

  if (meta.Item?.buzzedConnId === connId) {
    // This player was mid-buzz when they dropped — clear the buzz so the game
    // doesn't get stuck waiting for a judge on a dead connection.
    await ddb.send(new UpdateCommand({
      TableName: GAMES_TABLE,
      Key: { PK: `ROOM#${roomCode}`, SK: 'META' },
      UpdateExpression: 'SET buzzedConnId = :n',
      ExpressionAttributeValues: { ':n': null },
    }));
    await broadcast(apigw, liveConns, 'BACK_TO_BOARD', {
      usedQuestions: meta.Item?.usedQuestions ?? [],
    });
  } else {
    await broadcast(apigw, liveConns, 'PLAYER_LEFT', {
      playerId: connId,
      playerName: connItem.playerName,
    });
  }

  return { statusCode: 200, body: 'OK' };
};
