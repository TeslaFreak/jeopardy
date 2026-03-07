/**
 * POST /sets/{setId}/host
 *
 * Validates the set belongs to the authenticated user, generates a unique 6-char
 * room code, writes a room record to GamesTable, and returns the code.
 * The host then opens a WebSocket connection with ?roomCode=<code>&isHost=true.
 */

import { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { Category } from '../shared/types';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const SETS_TABLE = process.env.SETS_TABLE!;
const GAMES_TABLE = process.env.GAMES_TABLE!;

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // ambiguous chars removed
function randomCode(): string {
  let code = '';
  for (let i = 0; i < 4; i++) code += CHARS[Math.floor(Math.random() * CHARS.length)];
  return code;
}

async function uniqueCode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = randomCode();
    const existing = await ddb.send(new GetCommand({
      TableName: GAMES_TABLE,
      Key: { PK: `ROOM#${code}`, SK: 'META' },
    }));
    if (!existing.Item) return code;
  }
  throw new Error('Could not generate unique room code');
}

export const handler = async (
  event: APIGatewayProxyEventV2WithJWTAuthorizer
): Promise<APIGatewayProxyResultV2> => {
  const userId = event.requestContext.authorizer.jwt.claims['sub'] as string;
  const setId = event.pathParameters?.setId;

  if (!setId) return { statusCode: 400, body: JSON.stringify({ message: 'setId required' }) };

  // Verify the set exists and belongs to this user
  const meta = await ddb.send(new GetCommand({
    TableName: SETS_TABLE,
    Key: { PK: `USER#${userId}`, SK: `SET#${setId}` },
  }));
  if (!meta.Item) return { statusCode: 404, body: JSON.stringify({ message: 'Set not found' }) };

  // Load categories/questions
  const catsResult = await ddb.send(new QueryCommand({
    TableName: SETS_TABLE,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
    ExpressionAttributeValues: { ':pk': `SET#${setId}`, ':skPrefix': 'CATEGORY#' },
  }));
  const board: Category[] = (catsResult.Items ?? []).map((i: Record<string, unknown>) => i['category'] as Category);
  if (board.length === 0) {
    return { statusCode: 400, body: JSON.stringify({ message: 'Set has no categories. Add at least one category before hosting.' }) };
  }

  // Validate every question slot is filled with a clue and answer
  const QUESTION_VALUES = [100, 200, 300, 400, 500] as const;
  const missing: string[] = [];
  for (const cat of board) {
    for (const val of QUESTION_VALUES) {
      const q = cat.questions.find(q => q.value === val);
      if (!q || !q.clue.trim() || !q.answer.trim()) {
        missing.push(`${cat.name} $${val}`);
      }
    }
  }
  if (missing.length > 0) {
    const preview = missing.slice(0, 5).join(', ');
    const more = missing.length > 5 ? ` and ${missing.length - 5} more` : '';
    return {
      statusCode: 400,
      body: JSON.stringify({ message: `Set is incomplete. Fill in all clues and answers before hosting. Missing: ${preview}${more}.` }),
    };
  }

  const roomCode = await uniqueCode();
  const ttl = Math.floor(Date.now() / 1000) + 24 * 60 * 60; // 24 hours

  await ddb.send(new PutCommand({
    TableName: GAMES_TABLE,
    Item: {
      PK: `ROOM#${roomCode}`,
      SK: 'META',
      roomCode,
      setId,
      hostUserId: userId,
      hostConnId: null,        // set when host opens WS connection
      status: 'lobby',
      board,
      usedQuestions: [],
      ttl,
    },
  }));

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roomCode }),
  };
};
