/**
 * WebSocket $default handler — routes all game messages by `action` field.
 *
 * All messages have the shape: { action: string, payload: object }
 *
 * Supported actions:
 *   JOIN_ROOM          – player announces name after connecting
 *   START_GAME         – host starts the game (lobby → active), sends config
 *   SELECT_QUESTION    – host selects a cell from the board
 *   BUZZ_IN            – first player to buzz wins the clue
 *   JUDGE_ANSWER       – host marks the buzzed answer correct/incorrect
 *   BUZZ_TIMER_EXPIRED – host signals buzz-in answer timer ran out
 *   STEAL_EXPIRED      – host signals steal window timer ran out
 *   END_GAME           – host ends the game manually
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
  StartGamePayload,
  Category,
  GameConfig,
  DEFAULT_GAME_CONFIG,
  ConnectionRole,
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

type ConnRecord = { connId: string; playerName: string; score: number; role: ConnectionRole; isHost?: boolean; disconnected?: boolean };

function resolveRole(c: ConnRecord): ConnectionRole {
  return c.role ?? (c.isHost ? 'host' : 'player');
}

function buildScores(connections: ConnRecord[]) {
  return Object.fromEntries(
    connections.filter(c => resolveRole(c) === 'player' && !c.disconnected).map(c => [c.connId, c.score])
  );
}

function mergeConfig(partial?: Partial<GameConfig>): GameConfig {
  return {
    buzzInTimer: { ...DEFAULT_GAME_CONFIG.buzzInTimer, ...partial?.buzzInTimer },
    stealTimer: { ...DEFAULT_GAME_CONFIG.stealTimer, ...partial?.stealTimer },
    wrongAnswerPenalty: partial?.wrongAnswerPenalty ?? DEFAULT_GAME_CONFIG.wrongAnswerPenalty,
  };
}

/** Check if all questions are used; if so, end the game automatically. Returns true if game was ended. */
async function checkAutoEnd(
  roomCode: string,
  apigw: ApiGatewayManagementApiClient,
  liveConns: ConnRecord[]
): Promise<boolean> {
  const updatedRoom = await getRoom(roomCode);
  if (!updatedRoom) return false;
  const board = updatedRoom.board as Category[];
  const totalQuestions = board.length * 5;
  const usedCount = (updatedRoom.usedQuestions as string[])?.length ?? 0;
  if (usedCount >= totalQuestions) {
    await ddb.send(new UpdateCommand({
      TableName: GAMES_TABLE,
      Key: { PK: `ROOM#${roomCode}`, SK: 'META' },
      UpdateExpression: 'SET #s = :s',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':s': 'ended' },
    }));
    await broadcast(apigw, liveConns, 'GAME_OVER', {
      finalScores: buildScores(liveConns),
      allQuestionsComplete: true,
    });
    return true;
  }
  return false;
}

/** Handle wrong answer flow — apply penalty, update failed buzz list, trigger steal or resolve question. */
async function handleWrongAnswer(
  roomCode: string,
  playerId: string,
  value: number,
  room: Record<string, unknown>,
  apigw: ApiGatewayManagementApiClient,
  liveConns: ConnRecord[]
) {
  const config = (room.config as GameConfig) ?? DEFAULT_GAME_CONFIG;
  const scoreDelta = config.wrongAnswerPenalty === 'subtract' ? -value : 0;

  // Update player score
  if (scoreDelta !== 0) {
    await ddb.send(new UpdateCommand({
      TableName: GAMES_TABLE,
      Key: { PK: `ROOM#${roomCode}`, SK: `CONN#${playerId}` },
      UpdateExpression: 'SET score = score + :d',
      ExpressionAttributeValues: { ':d': scoreDelta },
    }));
  }

  // Add player to failedBuzzPlayers, clear buzzedConnId
  const currentFailed = (room.failedBuzzPlayers as string[]) ?? [];
  const newFailed = [...currentFailed, playerId];

  await ddb.send(new UpdateCommand({
    TableName: GAMES_TABLE,
    Key: { PK: `ROOM#${roomCode}`, SK: 'META' },
    UpdateExpression: 'SET failedBuzzPlayers = :f, buzzedConnId = :n',
    ExpressionAttributeValues: { ':f': newFailed, ':n': null },
  }));

  // Re-fetch connections for updated scores
  const freshConns = (await getConnections(roomCode)) as ConnRecord[];
  const freshLive = freshConns.filter(c => !c.disconnected);
  await broadcast(apigw, freshLive, 'SCORE_UPDATE', { scores: buildScores(freshLive) });

  // Steal flow or resolve
  if (config.stealTimer.enabled) {
    const stealDeadline = Date.now() + config.stealTimer.seconds * 1000;
    await broadcast(apigw, freshLive, 'STEAL_OPEN', {
      deadline: stealDeadline,
      failedBuzzPlayers: newFailed,
    });
  } else {
    await resolveQuestion(roomCode, room, apigw, freshLive, false);
  }
}

/** Mark question used, reveal answer, send BACK_TO_BOARD or auto-end. */
async function resolveQuestion(
  roomCode: string,
  room: Record<string, unknown>,
  apigw: ApiGatewayManagementApiClient,
  liveConns: ConnRecord[],
  wasCorrect: boolean,
  correctPlayerName?: string,
) {
  const activeQ = room.activeQuestion as { categorySlug: string; value: number } | null;
  const board = room.board as Category[];
  const questionKey = activeQ ? `${activeQ.categorySlug}#${activeQ.value}` : '';

  // Find the answer text
  let answerText = '';
  if (activeQ) {
    const cat = board.find(c => c.slug === activeQ.categorySlug);
    const q = cat?.questions.find(q => q.value === activeQ.value);
    answerText = q?.answer ?? '';
  }

  // Mark question used, clear active question, buzz, and failedBuzzPlayers
  await ddb.send(new UpdateCommand({
    TableName: GAMES_TABLE,
    Key: { PK: `ROOM#${roomCode}`, SK: 'META' },
    UpdateExpression:
      'SET usedQuestions = list_append(usedQuestions, :q), buzzedConnId = :n, activeQuestion = :na, failedBuzzPlayers = :f',
    ExpressionAttributeValues: { ':q': [questionKey], ':n': null, ':na': null, ':f': [] },
  }));

  // Reveal answer to all
  await broadcast(apigw, liveConns, 'REVEAL_ANSWER', {
    answer: answerText,
    wasCorrect,
    correctPlayerName,
  });

  // Check auto-end; if not ended, send BACK_TO_BOARD
  const ended = await checkAutoEnd(roomCode, apigw, liveConns);
  if (!ended) {
    const updatedRoom = await getRoom(roomCode);
    await broadcast(apigw, liveConns, 'BACK_TO_BOARD', {
      usedQuestions: updatedRoom?.usedQuestions ?? [],
    });
  }
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
  const { roomCode } = connItem;
  const role: ConnectionRole = connItem.role ?? (connItem.isHost ? 'host' : 'player');
  const isHost = role === 'host';

  const room = await getRoom(roomCode);
  if (!room) {
    await send(apigw, connId, 'ERROR', { message: 'Room not found' });
    return { statusCode: 404, body: 'Room not found' };
  }

  const connections = await getConnections(roomCode);
  const typedConns = connections as ConnRecord[];
  const liveConns = typedConns.filter(c => !c.disconnected);

  switch (msg.action) {
    case 'JOIN_ROOM': {
      const { playerName } = msg.payload as JoinRoomPayload;

      // Find a disconnected record for this player (reconnect recovery)
      const disconnectedRecord = typedConns.find(
        c => resolveRole(c) === 'player' && c.playerName === playerName && c.disconnected === true,
      );
      const isReconnect = !!disconnectedRecord && room.status === 'active';

      if (isReconnect && disconnectedRecord) {
        await ddb.send(new UpdateCommand({
          TableName: GAMES_TABLE,
          Key: { PK: `ROOM#${roomCode}`, SK: `CONN#${connId}` },
          UpdateExpression: 'SET playerName = :n, score = :s',
          ExpressionAttributeValues: { ':n': playerName, ':s': disconnectedRecord.score ?? 0 },
        }));
        await ddb.send(new DeleteCommand({
          TableName: GAMES_TABLE,
          Key: { PK: `ROOM#${roomCode}`, SK: `CONN#${disconnectedRecord.connId}` },
        }));
      } else {
        await ddb.send(new UpdateCommand({
          TableName: GAMES_TABLE,
          Key: { PK: `ROOM#${roomCode}`, SK: `CONN#${connId}` },
          UpdateExpression: 'SET playerName = :n',
          ExpressionAttributeValues: { ':n': playerName },
        }));
      }

      const freshConns = (await getConnections(roomCode)) as ConnRecord[];
      const freshLive = freshConns.filter(c => !c.disconnected);
      const joinPayload = {
        players: freshLive.filter(c => resolveRole(c) === 'player').map(c => ({
          connId: c.connId,
          playerName: c.playerName,
          score: c.score,
          role: 'player' as const,
        })),
        scores: buildScores(freshLive),
      };
      await broadcast(apigw, freshLive, 'PLAYER_JOINED', joinPayload);

      // Reconnect — send full game state
      if (isReconnect) {
        const config = (room.config as GameConfig) ?? DEFAULT_GAME_CONFIG;
        const activeQ = room.activeQuestion as { categorySlug: string; value: number } | null;
        let activeQPayload = null;
        if (activeQ) {
          const board = room.board as Category[];
          const cat = board.find(c => c.slug === activeQ.categorySlug);
          const q = cat?.questions.find(q => q.value === activeQ.value);
          if (cat && q) {
            // Strip answer for player reconnects
            activeQPayload = {
              question: { clue: q.clue, value: q.value },
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
          config,
          failedBuzzPlayers: room.failedBuzzPlayers ?? [],
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
      const { config: partialConfig } = (msg.payload ?? {}) as StartGamePayload;
      const config = mergeConfig(partialConfig);

      await ddb.send(new UpdateCommand({
        TableName: GAMES_TABLE,
        Key: { PK: `ROOM#${roomCode}`, SK: 'META' },
        UpdateExpression: 'SET #s = :s, config = :c, failedBuzzPlayers = :f',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: { ':s': 'active', ':c': config, ':f': [] },
      }));
      await broadcast(apigw, liveConns, 'GAME_STARTED', { board: room.board as Category[], config });
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
      // Store active question, reset failedBuzzPlayers
      await ddb.send(new UpdateCommand({
        TableName: GAMES_TABLE,
        Key: { PK: `ROOM#${roomCode}`, SK: 'META' },
        UpdateExpression: 'SET activeQuestion = :q, buzzedConnId = :n, failedBuzzPlayers = :f',
        ExpressionAttributeValues: { ':q': { categorySlug, value }, ':n': null, ':f': [] },
      }));
      // Send full question (with answer) only to host
      await send(apigw, connId, 'QUESTION_ACTIVE', {
        question,
        categorySlug,
        categoryName: category.name,
        value,
      });
      // Broadcast to everyone else WITHOUT the answer
      const nonHostConns = liveConns.filter(c => c.connId !== connId);
      await broadcast(apigw, nonHostConns, 'QUESTION_ACTIVE', {
        question: { clue: question.clue, value: question.value },
        categorySlug,
        categoryName: category.name,
        value,
      });
      break;
    }

    // ── BUZZ_IN ───────────────────────────────────────────────────────────
    case 'BUZZ_IN': {
      if (isHost || role === 'tv') break; // only players buzz
      if (room.buzzedConnId) {
        await send(apigw, connId, 'ERROR', { message: 'Someone already buzzed in' });
        break;
      }
      // Check if this player already failed on this question
      const failedList = (room.failedBuzzPlayers as string[]) ?? [];
      if (failedList.includes(connId)) {
        await send(apigw, connId, 'ERROR', { message: 'You already guessed on this question' });
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
        const config = (room.config as GameConfig) ?? DEFAULT_GAME_CONFIG;
        const deadline = config.buzzInTimer.enabled
          ? Date.now() + config.buzzInTimer.seconds * 1000
          : undefined;
        await broadcast(apigw, liveConns, 'PLAYER_BUZZED', {
          playerId: connId,
          playerName: connItem.playerName,
          deadline,
        });
      } catch {
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

      if (correct) {
        // Add score
        await ddb.send(new UpdateCommand({
          TableName: GAMES_TABLE,
          Key: { PK: `ROOM#${roomCode}`, SK: `CONN#${playerId}` },
          UpdateExpression: 'SET score = score + :d',
          ExpressionAttributeValues: { ':d': value },
        }));
        const freshConns = (await getConnections(roomCode)) as ConnRecord[];
        const freshLive = freshConns.filter(c => !c.disconnected);
        await broadcast(apigw, freshLive, 'SCORE_UPDATE', { scores: buildScores(freshLive) });

        const player = freshLive.find(c => c.connId === playerId);
        await resolveQuestion(roomCode, room, apigw, freshLive, true, player?.playerName);
      } else {
        await handleWrongAnswer(roomCode, playerId, value, room, apigw, liveConns);
      }
      break;
    }

    // ── BUZZ_TIMER_EXPIRED ────────────────────────────────────────────────
    case 'BUZZ_TIMER_EXPIRED': {
      if (!isHost) {
        await send(apigw, connId, 'ERROR', { message: 'Only the host can signal timer expiry' });
        break;
      }
      const buzzedPlayerId = room.buzzedConnId as string | null;
      if (!buzzedPlayerId) break;
      const activeQ = room.activeQuestion as { categorySlug: string; value: number } | null;
      if (!activeQ) break;

      // Treat as wrong answer
      await handleWrongAnswer(roomCode, buzzedPlayerId, activeQ.value, room, apigw, liveConns);
      break;
    }

    // ── STEAL_EXPIRED ─────────────────────────────────────────────────────
    case 'STEAL_EXPIRED': {
      if (!isHost) {
        await send(apigw, connId, 'ERROR', { message: 'Only the host can signal steal expiry' });
        break;
      }
      // Re-fetch room for latest state
      const freshRoom = await getRoom(roomCode);
      if (!freshRoom) break;
      const freshConns = (await getConnections(roomCode)) as ConnRecord[];
      const freshLive = freshConns.filter(c => !c.disconnected);
      await resolveQuestion(roomCode, freshRoom, apigw, freshLive, false);
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
