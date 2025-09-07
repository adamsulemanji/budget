import { Context } from 'aws-lambda';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const bedrockClient = new BedrockRuntimeClient({});
const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const CATEGORIES_TABLE_NAME = process.env.CATEGORIES_TABLE_NAME!;
const TRANSACTIONS_TABLE_NAME = process.env.TRANSACTIONS_TABLE_NAME!;

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

interface ClassificationResult {
  success: boolean;
  classifiedCount: number;
  error?: string;
  input: StepFunctionInput;
}

interface BedrockResponse {
  items: Array<{
    index: number;
    category: string;
    confidence: number;
  }>;
}

interface StepFunctionPayload {
  Payload: {
    success: boolean;
    lineItems: Array<{
      date: string;
      merchant: string;
      amount: number;
      memo?: string;
    }>;
    input: StepFunctionInput;
  };
}

export const main = async (inputPayload: StepFunctionInput | StepFunctionPayload, context: Context): Promise<ClassificationResult> => {
  try {
    // Handle Step Function payload structure
    let input: StepFunctionInput;
    if ('Payload' in inputPayload) {
      // This is coming from a Step Function with payloadResponseOnly: false
      input = inputPayload.Payload.input;
    } else {
      // Direct invocation or payloadResponseOnly: true
      input = inputPayload;
    }

    console.log('Step Function Input:', JSON.stringify(input, null, 2));
    console.log('userId:', input.userId, 'statementId:', input.statementId);
    
    if (!input.userId || !input.statementId) {
      throw new Error(`Missing required input: userId=${input.userId}, statementId=${input.statementId}`);
    }

    console.log('Classifying transactions for statement:', input.statementId);

    // Get active categories from DynamoDB
    const categories = await getActiveCategories(input.userId);
    console.log('Active categories:', categories);

    // Get unclassified transactions for this statement
    const transactions = await getUnclassifiedTransactions(input.userId, input.statementId);
    console.log('Unclassified transactions:', transactions.length);

    if (transactions.length === 0) {
      return {
        success: true,
        classifiedCount: 0,
        input,
      };
    }

    // Build prompt for Bedrock
    const prompt = buildClassificationPrompt(transactions, categories);
    console.log('Bedrock prompt:', prompt);

    // Call Bedrock
    const command = new InvokeModelCommand({
      modelId: 'meta.llama3-8b-instruct-v1:0',
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        prompt: prompt,
        max_gen_len: 4000,
        temperature: 0.1,
        top_p: 0.9,
      }),
    });

    const response = await bedrockClient.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    const classificationResult = JSON.parse(responseBody.generation) as BedrockResponse;

    console.log('Bedrock classification result:', classificationResult);

    // Update transactions with classifications
    let classifiedCount = 0;
    for (const item of classificationResult.items) {
      if (item.index >= 0 && item.index < transactions.length) {
        const transaction = transactions[item.index];
        await updateTransactionCategory(
          input.userId,
          transaction.sk,
          item.category,
          item.confidence
        );
        classifiedCount++;
      }
    }

    return {
      success: true,
      classifiedCount,
      input,
    };
  } catch (error) {
    console.error('Error classifying transactions:', error);
    return {
      success: false,
      classifiedCount: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
      input: ('Payload' in inputPayload) ? inputPayload.Payload.input : inputPayload,
    };
  }
};

async function getActiveCategories(userId: string): Promise<string[]> {
  const command = new QueryCommand({
    TableName: CATEGORIES_TABLE_NAME,
    KeyConditionExpression: 'pk = :pk',
    FilterExpression: 'active = :active',
    ExpressionAttributeValues: {
      ':pk': `USER#${userId}`,
      ':active': true,
    },
  });

  const response = await dynamoClient.send(command);
  return response.Items?.map((item: any) => item.name) || [];
}

async function getUnclassifiedTransactions(userId: string, statementId: string): Promise<any[]> {
  console.log('Querying for unclassified transactions:', { userId, statementId });
  
  const command = new QueryCommand({
    TableName: TRANSACTIONS_TABLE_NAME,
    IndexName: 'by-statement-id',
    KeyConditionExpression: 'statementId = :sid',
    FilterExpression: 'category = :cat',
    ExpressionAttributeValues: {
      ':sid': statementId,
      ':cat': 'UNASSIGNED',
    },
  });

  console.log('DynamoDB Query Command:', JSON.stringify(command, null, 2));

  const response = await dynamoClient.send(command);
  console.log('DynamoDB Query Response:', JSON.stringify(response, null, 2));
  
  return response.Items || [];
}

function buildClassificationPrompt(transactions: any[], categories: string[]): string {
  const categoriesList = categories.map(cat => `- ${cat}`).join('\n');
  
  const lineItemsText = transactions.map((txn, index) => {
    return `${index} | ${txn.merchantNorm} | $${txn.amount.toFixed(2)}`;
  }).join('\n');

  return `You are a budgeting assistant. Categorize each transaction using ONLY the provided categories. 
Return valid JSON. If unsure, select "UNASSIGNED". No extra text.

CATEGORIES:
${categoriesList}

TASK:
For each line item, choose the best category.

OUTPUT SCHEMA:
{ "items": [ { "index": 0, "category": "CATEG", "confidence": 0.0 } ] }

LINE ITEMS:
${lineItemsText}`;
}

async function updateTransactionCategory(
  userId: string,
  sk: string,
  category: string,
  confidence: number
): Promise<void> {
  const command = new UpdateCommand({
    TableName: TRANSACTIONS_TABLE_NAME,
    Key: {
      pk: `USER#${userId}`,
      sk,
    },
    UpdateExpression: 'SET category = :category, confidence = :confidence, updatedAt = :updatedAt',
    ExpressionAttributeValues: {
      ':category': category,
      ':confidence': confidence,
      ':updatedAt': new Date().toISOString(),
    },
  });

  await dynamoClient.send(command);
}
