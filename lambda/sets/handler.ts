/**
 * HTTP API handler — CRUD for game sets & categories/questions.
 *
 * Routes (all require Cognito JWT auth; userId extracted from authorizer claims):
 *   POST   /sets                               Create a new game set
 *   GET    /sets                               List sets for the authenticated user
 *   GET    /sets/{setId}                       Get a single set (with categories)
 *   PUT    /sets/{setId}                       Update set title
 *   DELETE /sets/{setId}                       Delete a set and all its categories
 *
 *   POST   /sets/{setId}/categories            Add a category
 *   PUT    /sets/{setId}/categories/{slug}     Update a category's name / questions
 *   DELETE /sets/{setId}/categories/{slug}     Delete a category
 */

import { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from 'aws-lambda';
import { randomUUID } from 'crypto';
import { ddb, PutCommand, GetCommand, QueryCommand, DeleteCommand, UpdateCommand } from '../shared/db';
import { Category } from '../shared/types';

const TABLE = process.env.SETS_TABLE!;

const ok = (body: unknown, status = 200): APIGatewayProxyResultV2 => ({
  statusCode: status,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const err = (message: string, status = 400): APIGatewayProxyResultV2 => ({
  statusCode: status,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message }),
});

export const handler = async (
  event: APIGatewayProxyEventV2WithJWTAuthorizer
): Promise<APIGatewayProxyResultV2> => {
  const userId = event.requestContext.authorizer.jwt.claims['sub'] as string;
  const method = event.requestContext.http.method;
  const rawPath = event.rawPath; // e.g. /sets, /sets/abc123, /sets/abc123/categories/fun

  // ── POST /sets ────────────────────────────────────────────────────────────
  if (method === 'POST' && /^\/sets$/.test(rawPath)) {
    const body = JSON.parse(event.body ?? '{}');
    if (!body.title?.trim()) return err('title is required');
    const setId = randomUUID();
    const now = new Date().toISOString();
    await ddb.send(new PutCommand({
      TableName: TABLE,
      Item: {
        PK: `USER#${userId}`,
        SK: `SET#${setId}`,
        setId,
        title: body.title.trim(),
        createdAt: now,
        updatedAt: now,
      },
    }));
    return ok({ setId, title: body.title.trim(), createdAt: now, updatedAt: now }, 201);
  }

  // ── GET /sets ─────────────────────────────────────────────────────────────
  if (method === 'GET' && /^\/sets$/.test(rawPath)) {
    const result = await ddb.send(new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
      ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':skPrefix': 'SET#' },
    }));
    return ok(result.Items ?? []);
  }

  // ── GET /sets/{setId} ─────────────────────────────────────────────────────
  const setMatch = rawPath.match(/^\/sets\/([^/]+)$/);
  if (method === 'GET' && setMatch) {
    const setId = setMatch[1];
    const [metaResult, catsResult] = await Promise.all([
      ddb.send(new GetCommand({ TableName: TABLE, Key: { PK: `USER#${userId}`, SK: `SET#${setId}` } })),
      ddb.send(new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
        ExpressionAttributeValues: { ':pk': `SET#${setId}`, ':skPrefix': 'CATEGORY#' },
      })),
    ]);
    if (!metaResult.Item) return err('Set not found', 404);
    return ok({ ...metaResult.Item, categories: (catsResult.Items ?? []).map((i: Record<string, unknown>) => i['category']) });
  }

  // ── PUT /sets/{setId} ─────────────────────────────────────────────────────
  if (method === 'PUT' && setMatch) {
    const setId = setMatch[1];
    const body = JSON.parse(event.body ?? '{}');
    if (!body.title?.trim()) return err('title is required');
    const now = new Date().toISOString();
    await ddb.send(new UpdateCommand({
      TableName: TABLE,
      Key: { PK: `USER#${userId}`, SK: `SET#${setId}` },
      UpdateExpression: 'SET title = :t, updatedAt = :u',
      ExpressionAttributeValues: { ':t': body.title.trim(), ':u': now },
      ConditionExpression: 'attribute_exists(PK)',
    }));
    return ok({ setId, title: body.title.trim(), updatedAt: now });
  }

  // ── DELETE /sets/{setId} ──────────────────────────────────────────────────
  if (method === 'DELETE' && setMatch) {
    const setId = setMatch[1];
    // Delete metadata row
    await ddb.send(new DeleteCommand({ TableName: TABLE, Key: { PK: `USER#${userId}`, SK: `SET#${setId}` } }));
    // Delete all category rows
    const cats = await ddb.send(new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
      ExpressionAttributeValues: { ':pk': `SET#${setId}`, ':skPrefix': 'CATEGORY#' },
    }));
    await Promise.all((cats.Items ?? []).map((item: Record<string, unknown>) =>
      ddb.send(new DeleteCommand({ TableName: TABLE, Key: { PK: item['PK'] as string, SK: item['SK'] as string } }))
    ));
    return ok({ deleted: true });
  }

  // ── POST /sets/{setId}/categories ─────────────────────────────────────────
  const catListMatch = rawPath.match(/^\/sets\/([^/]+)\/categories$/);
  if (method === 'POST' && catListMatch) {
    const setId = catListMatch[1];
    const body = JSON.parse(event.body ?? '{}') as Category;
    if (!body.name?.trim() || !body.slug?.trim()) return err('name and slug are required');
    await ddb.send(new PutCommand({
      TableName: TABLE,
      Item: { PK: `SET#${setId}`, SK: `CATEGORY#${body.slug}`, category: body },
    }));
    return ok(body, 201);
  }

  // ── PUT /sets/{setId}/categories/{slug} ───────────────────────────────────
  const catMatch = rawPath.match(/^\/sets\/([^/]+)\/categories\/([^/]+)$/);
  if (method === 'PUT' && catMatch) {
    const [, setId, slug] = catMatch;
    const body = JSON.parse(event.body ?? '{}') as Category;
    await ddb.send(new PutCommand({
      TableName: TABLE,
      Item: { PK: `SET#${setId}`, SK: `CATEGORY#${slug}`, category: body },
    }));
    return ok(body);
  }

  // ── DELETE /sets/{setId}/categories/{slug} ────────────────────────────────
  if (method === 'DELETE' && catMatch) {
    const [, setId, slug] = catMatch;
    await ddb.send(new DeleteCommand({ TableName: TABLE, Key: { PK: `SET#${setId}`, SK: `CATEGORY#${slug}` } }));
    return ok({ deleted: true });
  }

  return err('Not found', 404);
};
