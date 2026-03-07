/**
 * WebSocket $default handler — routes all game messages by `action` field.
 *
 * All messages have the shape: { action: string, payload: object }
 *
 * Supported actions:
 *   JOIN_ROOM       – player announces name after connecting
 *   START_GAME      – host starts the game (lobby → active)
 *   SELECT_QUESTION – host selects a cell from the board
 *   BUZZ_IN         – first player to buzz wins the clue
 *   JUDGE_ANSWER    – host marks the buzzed answer correct/incorrect
 *   END_GAME        – host ends the game manually
 */

import { APIGatewayProxyResultV2, APIGatewayProxyWebsocketEventV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  UpdateCommand,
  QueryCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import {
  WsMessage,
  ServerAction,
  JoinRoomPayload,
  SelectQuestionPayload,
  JudgeAnswerPayload,
  Category,
} from '../shared/types';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const GAMES_TABLE = process.env.GAMES_TABLE!;

// ── Utility ───────────────────────────────────────────────────────────────────

function apigwClient(domainName: string, stage: string) {
  return new ApiGatewayManagementApiClient({ endpoint: `https://${domainName}/${stage}` });
}

async function send(
  apigw: ApiGatewayManagementApiClient,
  connId: string,
  action: ServerAction,
  payload: unknown
) {
  const msg: WsMessage = { action, payload };
  await apigw.send(new PostToConnectionCommand({
    ConnectionId: connId,
    Data: Buffer.from(JSON.stringify(msg)),
  })).catch(() => undefined); // swallow stale connection errors
}

async function broadcast(
  apigw: ApiGatewayManagementApiClient,
  connections: { connId: string }[],
  action: ServerAction,
  payload: unknown
) {
  await Promise.allSettled(connections.map(c => send(apigw, c.connId, action, payload)));
}

async function getRoom(roomCode: string) {
  const result = await ddb.send(new GetCommand({
    TableName: GAMES_TABLE,
    Key: { PK: `ROOM#${roomCode}`, SK: 'META' },
  }));
  return result.Item;
}

async function getConnections(roomCode: string) {
  const result = await ddb.send(new QueryCommand({
    TableName: GAMES_TABLE,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
    ExpressionAttributeValues: { ':pk': `ROOM#${roomCode}`, ':skPrefix': 'CONN#' },
  }));
  return result.Items ?? [];
}

async function getConnItem(connId: string) {
  const result = await ddb.send(new QueryCommand({
    TableName: GAMES_TABLE,
    IndexName: 'ConnIdIndex',
    KeyConditionExpression: 'connId = :c',
    ExpressionAttributeValues: { ':c': connId },
  }));
  return result.Items?.[0];
}

function buildScores(connections: { connId: string; playerName: string; score: number; isHost: boolean; disconnected?: boolean }[]) {
  return Object.fromEntries(
    connections.filter(c => !c.isHost && !c.disconnected).map(c => [c.connId, c.score])
  );
}

// ── Handler ────────────────────────────────────────────────────────────────────

export const handler = async (
  event: APIGatewayProxyWebsocketEventV2
): Promise<APIGatewayProxyResultV2> => {
  const connId = event.requestContext.connectionId;
  const { domainName, stage } = event.requestContext;
  const apigw = apigwClient(domainName, stage);

  let msg: WsMessage;
  try {
    msg = JSON.parse(event.body ?? '{}') as WsMessage;
  } catch {
    await send(apigw, connId, 'ERROR', { message: 'Invalid JSON' });
    return { statusCode: 400, body: 'Bad request' };
  }

  // Look up this connection's room
  const connItem = await getConnItem(connId);
  if (!connItem) {
    await send(apigw, connId, 'ERROR', { message: 'Connection not registered' });
    return { statusCode: 400, body: 'Unknown connection' };
  }
  const { roomCode, isHost } = connItem;

  const room = await getRoom(roomCode);
  if (!room) {
    await send(apigw, connId, 'ERROR', { message: 'Room not found' });
    return { statusCode: 404, body: 'Room not found' };
  }

  const connections = await getConnections(roomCode);
  // Include disconnected records in typedConns so JOIN_ROOM can detect them;
  // filter them out before any broadcast.
  const typedConns = connections as { connId: string; playerName: string; score: number; isHost: boolean; disconnected?: boolean }[];
  const liveConns = typedConns.filter(c => !c.disconnected);

  switch (msg.action) {
    case 'JOIN_ROOM': {
      const { playerName } = msg.payload as JoinRoomPayload;

      // Find a disconnected record for this player (the disconnect handler marks
      // records disconnected=true instead of deleting them during active games,
      // so the score is preserved here for reconnect recovery).
      const disconnectedRecord = typedConns.find(
        c => !c.isHost && c.playerName === playerName && c.disconnected === true,
      );
      const isReconnect = !!disconnectedRecord && room.status === 'active';

      if (isReconnect && disconnectedRecord) {
        // Restore score from the preserved disconnected record
        await ddb.send(new UpdateCommand({
          TableName: GAMES_TABLE,
          Key: { PK: `ROOM#${roomCode}`, SK: `CONN#${connId}` },
          UpdateExpression: 'SET playerName = :n, score = :s',
          ExpressionAttributeValues: { ':n': playerName, ':s': disconnectedRecord.score ?? 0 },
        }));
        // Clean up the old disconnected record
        await ddb.send(new DeleteCommand({
          TableName: GAMES_TABLE,
          Key: { PK: `ROOM#${roomCode}`, SK: `CONN#${disconnectedRecord.connId}` },
        }));
      } else {
        // Normal join — just set the player name
        await ddb.send(new UpdateCommand({
          TableName: GAMES_TABLE,
          Key: { PK: `ROOM#${roomCode}`, SK: `CONN#${connId}` },
          UpdateExpression: 'SET playerName = :n',
          ExpressionAttributeValues: { ':n': playerName },
        }));
      }

      // Re-fetch connections; old disconnected record now deleted so list is clean
      const freshConns = (await getConnections(roomCode)) as typeof typedConns;
      const freshLive = freshConns.filter(c => !c.disconnected);
      const joinPayload = {
        players: freshLive.filter(c => !c.isHost).map(c => ({
          connId: c.connId,
          playerName: c.playerName,
          score: c.score,
          isHost: false,
        })),
        scores: buildScores(freshLive),
      };
      await broadcast(apigw, freshLive, 'PLAYER_JOINED', joinPayload);

      // For reconnects to an active room: send full game state to the rejoining player
      if (isReconnect) {
        const activeQ = room.activeQuestion as { categorySlug: string; value: number } | null;
        let activeQPayload = null;
        if (activeQ) {
          const board = room.board as Category[];
          const cat = board.find(c => c.slug === activeQ.categorySlug);
          const q = cat?.questions.find(q => q.value === activeQ.value);
          if (cat && q) {
            activeQPayload = {
              question: q,
              categorySlug: activeQ.categorySlug,
              categoryName: cat.name,
              value: activeQ.value,
            };
          }
        }
        let buzzedPlayerPayload = null;
        if (room.buzzedConnId) {
          const bc = freshLive.find(c => c.connId === room.buzzedConnId);
          if (bc) buzzedPlayerPayload = { playerId: bc.connId, playerName: bc.playerName };
        }
        await send(apigw, connId, 'GAME_STATE_SYNC', {
          board: room.board,
          usedQuestions: room.usedQuestions ?? [],
          scores: buildScores(freshLive),
          activeQuestion: activeQPayload,
          buzzedPlayer: buzzedPlayerPayload,
        });
      }
      break;
    }

    // ── START_GAME ────────────────────────────────────────────────────────
    case 'START_GAME': {
      if (!isHost) {
        await send(apigw, connId, 'ERROR', { message: 'Only the host can start the game' });
        break;
      }
      if (room.status !== 'lobby') {
        await send(apigw, connId, 'ERROR', { message: 'Game already started' });
        break;
      }
      await ddb.send(new UpdateCommand({
        TableName: GAMES_TABLE,
        Key: { PK: `ROOM#${roomCode}`, SK: 'META' },
        UpdateExpression: 'SET #s = :s',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: { ':s': 'active' },
      }));
      await broadcast(apigw, liveConns, 'GAME_STARTED', { board: room.board as Category[] });
      break;
    }

    // ── SELECT_QUESTION ───────────────────────────────────────────────────
    case 'SELECT_QUESTION': {
      if (!isHost) {
        await send(apigw, connId, 'ERROR', { message: 'Only the host can select questions' });
        break;
      }
      const { categorySlug, value } = msg.payload as SelectQuestionPayload;
      const questionKey = `${categorySlug}#${value}`;
      if (room.usedQuestions?.includes(questionKey)) {
        await send(apigw, connId, 'ERROR', { message: 'Question already used' });
        break;
      }
      const board = room.board as Category[];
      const category = board.find(c => c.slug === categorySlug);
      const question = category?.questions.find(q => q.value === value);
      if (!category || !question) {
        await send(apigw, connId, 'ERROR', { message: 'Question not found' });
        break;
      }
      // Store current active question on META so disconnect handler can reference it
      await ddb.send(new UpdateCommand({
        TableName: GAMES_TABLE,
        Key: { PK: `ROOM#${roomCode}`, SK: 'META' },
        UpdateExpression: 'SET activeQuestion = :q, buzzedConnId = :n',
        ExpressionAttributeValues: { ':q': { categorySlug, value }, ':n': null },
      }));
      await broadcast(apigw, liveConns, 'QUESTION_ACTIVE', {
        question,
        categorySlug,
        categoryName: category.name,
        value,
      });
      break;
    }

    // ── BUZZ_IN ───────────────────────────────────────────────────────────
    case 'BUZZ_IN': {
      if (isHost) break; // hosts can't buzz
      if (room.buzzedConnId) {
        await send(apigw, connId, 'ERROR', { message: 'Someone already buzzed in' });
        break;
      }
      // Atomic conditional update — only set if buzzedConnId is null
      try {
        await ddb.send(new UpdateCommand({
          TableName: GAMES_TABLE,
          Key: { PK: `ROOM#${roomCode}`, SK: 'META' },
          UpdateExpression: 'SET buzzedConnId = :c',
          ConditionExpression: 'attribute_not_exists(buzzedConnId) OR buzzedConnId = :n',
          ExpressionAttributeValues: { ':c': connId, ':n': null },
        }));
        await broadcast(apigw, liveConns, 'PLAYER_BUZZED', {
          playerId: connId,
          playerName: connItem.playerName,
        });
      } catch {
        // Another player beat them to it
        await send(apigw, connId, 'ERROR', { message: 'Someone already buzzed in' });
      }
      break;
    }

    // ── JUDGE_ANSWER ──────────────────────────────────────────────────────
    case 'JUDGE_ANSWER': {
      if (!isHost) {
        await send(apigw, connId, 'ERROR', { message: 'Only the host can judge answers' });
        break;
      }
      const { correct, playerId, value } = msg.payload as JudgeAnswerPayload;
      const scoreDelta = correct ? value : -value;
      const questionKey = `${room.activeQuestion?.categorySlug}#${room.activeQuestion?.value}`;

      // Update player score
      await ddb.send(new UpdateCommand({
        TableName: GAMES_TABLE,
        Key: { PK: `ROOM#${roomCode}`, SK: `CONN#${playerId}` },
        UpdateExpression: 'SET score = score + :d',
        ExpressionAttributeValues: { ':d': scoreDelta },
      }));

      // Mark question used, clear active question and buzz
      await ddb.send(new UpdateCommand({
        TableName: GAMES_TABLE,
        Key: { PK: `ROOM#${roomCode}`, SK: 'META' },
        UpdateExpression:
          'SET usedQuestions = list_append(usedQuestions, :q), buzzedConnId = :n, activeQuestion = :na',
        ExpressionAttributeValues: { ':q': [questionKey], ':n': null, ':na': null },
      }));

      // Re-fetch connections to get updated scores
      const freshConns2 = await getConnections(roomCode) as typeof typedConns;
      const freshLive2 = freshConns2.filter(c => !c.disconnected);
      await broadcast(apigw, freshLive2, 'SCORE_UPDATE', { scores: buildScores(freshLive2) });

      const updatedRoom = await getRoom(roomCode);
      await broadcast(apigw, freshLive2, 'BACK_TO_BOARD', {
        usedQuestions: updatedRoom?.usedQuestions ?? [],
      });
      break;
    }

    // ── END_GAME ──────────────────────────────────────────────────────────
    case 'END_GAME': {
      if (!isHost) {
        await send(apigw, connId, 'ERROR', { message: 'Only the host can end the game' });
        break;
      }
      await ddb.send(new UpdateCommand({
        TableName: GAMES_TABLE,
        Key: { PK: `ROOM#${roomCode}`, SK: 'META' },
        UpdateExpression: 'SET #s = :s',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: { ':s': 'ended' },
      }));
      await broadcast(apigw, liveConns, 'GAME_OVER', { finalScores: buildScores(liveConns) });
      break;
    }

    default:
      await send(apigw, connId, 'ERROR', { message: `Unknown action: ${msg.action}` });
  }

  return { statusCode: 200, body: 'OK' };
};
