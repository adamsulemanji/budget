import { Context } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const STATEMENTS_TABLE_NAME = process.env.STATEMENTS_TABLE_NAME!;

interface StepFunctionInput {
  userId: string;
  statementId: string;
  key: string;
  issuer: string;
  cardLast4: string;
  lineItems?: Array<{
    date: string;
    merchant: string;
    amount: number;
    memo?: string;
  }>;
}

interface MarkParsedResult {
  success: boolean;
  status: string;
  error?: string;
  input: StepFunctionInput;
}

export const main = async (input: StepFunctionInput, context: Context): Promise<MarkParsedResult> => {
  try {
    console.log('Marking statement as parsed:', input.statementId);

    // Determine status based on context
    // If this is called from error handling, mark as FAILED
    // Otherwise, mark as PARSED
    const status = context.getRemainingTimeInMillis() > 0 ? 'PARSED' : 'FAILED';

    // Store statement record in DynamoDB
    await dynamoClient.send(new PutCommand({
      TableName: STATEMENTS_TABLE_NAME,
      Item: {
        pk: `USER#${input.userId}`,
        sk: `STATEMENT#${input.statementId}`,
        s3Key: input.key,
        status,
        issuer: input.issuer,
        cardLast4: input.cardLast4,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lineItemCount: input.lineItems?.length || 0,
      },
    }));

    console.log(`Statement ${input.statementId} marked as ${status}`);

    return {
      success: true,
      status,
      input,
    };
  } catch (error) {
    console.error('Error marking statement as parsed:', error);
    return {
      success: false,
      status: 'FAILED',
      error: error instanceof Error ? error.message : 'Unknown error',
      input,
    };
  }
};
