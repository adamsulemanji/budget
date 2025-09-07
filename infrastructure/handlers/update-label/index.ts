import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';

const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TRANSACTIONS_TABLE_NAME = process.env.TRANSACTIONS_TABLE_NAME!;

interface UpdateLabelRequest {
  userId: string;
  txnId: string;
  newCategory: string;
}

export const main = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {

    // Parse request body
    const body = JSON.parse(event.body || '{}') as UpdateLabelRequest;
    const { userId, txnId, newCategory } = body;

    // Validate required fields
    if (!userId || !txnId || !newCategory) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ error: 'Missing required fields: userId, txnId, newCategory' }),
      };
    }

    // Validate txnId format
    if (!txnId.startsWith('DATE#') || !txnId.includes('#TXN#')) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ error: 'Invalid txnId format' }),
      };
    }

    // Check if transaction exists
    const getCommand = new GetCommand({
      TableName: TRANSACTIONS_TABLE_NAME,
      Key: {
        pk: `USER#${userId}`,
        sk: txnId,
      },
    });

    const existingTransaction = await dynamoClient.send(getCommand);
    if (!existingTransaction.Item) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ error: 'Transaction not found' }),
      };
    }

    // Update transaction category
    const updateCommand = new UpdateCommand({
      TableName: TRANSACTIONS_TABLE_NAME,
      Key: {
        pk: `USER#${userId}`,
        sk: txnId,
      },
      UpdateExpression: 'SET category = :category, confidence = :confidence, updatedAt = :updatedAt, manuallyUpdated = :manuallyUpdated',
      ExpressionAttributeValues: {
        ':category': newCategory,
        ':confidence': 1.0, // Manual updates have 100% confidence
        ':updatedAt': new Date().toISOString(),
        ':manuallyUpdated': true,
      },
      ReturnValues: 'ALL_NEW',
    });

    const result = await dynamoClient.send(updateCommand);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        updated: true,
        category: newCategory,
        transaction: result.Attributes,
      }),
    };
  } catch (error) {
    console.error('Error updating transaction label:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
