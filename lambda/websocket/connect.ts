/**
 * WebSocket $connect handler
 *
 * Query string parameters:
 *   roomCode   – required; the 4-char room code from POST /sets/{setId}/host
 *   playerName – required for players; omit or set to "__host__" for the host
 *   role       – "host" | "player" | "tv" (default "player")
 *   isHost     – legacy; "true" maps to role=host
 *
 * Stores a CONN# record in GamesTable and (if host) sets hostConnId on META.
 */

import { APIGatewayProxyResultV2, APIGatewayProxyWebsocketEventV2 } from 'aws-lambda';

// @types/aws-lambda doesn't include queryStringParameters on the WS event type,
// but they ARE present on $connect invocations.
type WsConnectEvent = APIGatewayProxyWebsocketEventV2 & {
  queryStringParameters?: Record<string, string | undefined>;
};
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { ConnectionRole } from '../shared/types';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const GAMES_TABLE = process.env.GAMES_TABLE!;

export const handler = async (
  event: WsConnectEvent
): Promise<APIGatewayProxyResultV2> => {
  const connId = event.requestContext.connectionId;
  const qs = event.queryStringParameters ?? {};
  const roomCode = qs['roomCode'];
  const playerName = qs['playerName'] ?? 'Anonymous';

  // Determine role: explicit role param, or legacy isHost mapping
  let role: ConnectionRole = 'player';
  if (qs['role'] === 'host' || qs['role'] === 'tv') {
    role = qs['role'];
  } else if (qs['isHost'] === 'true') {
    role = 'host';
  }

  if (!roomCode) return { statusCode: 400, body: 'roomCode required' };

  // Verify room exists
  const roomResult = await ddb.send(new GetCommand({
    TableName: GAMES_TABLE,
    Key: { PK: `ROOM#${roomCode}`, SK: 'META' },
  }));
  if (!roomResult.Item) return { statusCode: 404, body: 'Room not found' };
  if (roomResult.Item.status === 'ended') return { statusCode: 410, body: 'Room has ended' };

  const ttl = Math.floor(Date.now() / 1000) + 24 * 60 * 60;

  // Store connection record
  const displayName = role === 'host' ? '__host__' : role === 'tv' ? '__tv__' : playerName;
  await ddb.send(new PutCommand({
    TableName: GAMES_TABLE,
    Item: {
      PK: `ROOM#${roomCode}`,
      SK: `CONN#${connId}`,
      connId,
      roomCode,
      playerName: displayName,
      score: 0,
      role,
      isHost: role === 'host', // backward compat field
      ttl,
    },
  }));

  // If host, update META with hostConnId
  if (role === 'host') {
    await ddb.send(new UpdateCommand({
      TableName: GAMES_TABLE,
      Key: { PK: `ROOM#${roomCode}`, SK: 'META' },
      UpdateExpression: 'SET hostConnId = :c',
      ExpressionAttributeValues: { ':c': connId },
    }));
  }

  return { statusCode: 200, body: 'Connected' };
};
