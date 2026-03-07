/**
 * DynamoDB helper used by all Lambda functions.
 * Table structure (SetsTable):
 *   PK = USER#<userId>    SK = SET#<setId>          → Set metadata
 *   PK = SET#<setId>      SK = CATEGORY#<slug>       → Category + questions
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
  DeleteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';

export const ddbClient = new DynamoDBClient({});
export const ddb = DynamoDBDocumentClient.from(ddbClient);

export { PutCommand, GetCommand, QueryCommand, DeleteCommand, UpdateCommand };
