import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const CATEGORIES_TABLE_NAME = process.env.CATEGORIES_TABLE_NAME!;

interface CreateCategoryRequest {
  name: string;
  hints?: string[];
}

interface UpdateCategoryRequest {
  name: string;
  active?: boolean;
  hints?: string[];
}

export const main = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const method = event.httpMethod;
    const userId = event.pathParameters?.userId;

    if (!userId) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ error: 'userId is required' }),
      };
    }

    switch (method) {
      case 'POST':
        return await createCategory(event, userId);
      case 'GET':
        return await getCategories(userId);
      case 'PUT':
        return await updateCategory(event, userId);
      default:
        return {
          statusCode: 405,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({ error: 'Method not allowed' }),
        };
    }
  } catch (error) {
    console.error('Error handling categories request:', error);
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

async function createCategory(event: APIGatewayProxyEvent, userId: string): Promise<APIGatewayProxyResult> {
  const body = JSON.parse(event.body || '{}') as CreateCategoryRequest;
  const { name, hints = [] } = body;

  if (!name || typeof name !== 'string') {
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ error: 'Category name is required' }),
    };
  }

  // Validate category name format
  if (!/^[A-Z_]+$/.test(name)) {
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ error: 'Category name must be uppercase letters and underscores only' }),
    };
  }

  try {
    const command = new PutCommand({
      TableName: CATEGORIES_TABLE_NAME,
      Item: {
        pk: `USER#${userId}`,
        sk: `CATEGORY#${name}`,
        name,
        active: true,
        hints,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });

    await dynamoClient.send(command);

    return {
      statusCode: 201,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        created: true,
        category: { name, active: true, hints },
      }),
    };
  } catch (error) {
    console.error('Error creating category:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ error: 'Failed to create category' }),
    };
  }
}

async function getCategories(userId: string): Promise<APIGatewayProxyResult> {
  try {
    const command = new QueryCommand({
      TableName: CATEGORIES_TABLE_NAME,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
      },
    });

    const response = await dynamoClient.send(command);
    const categories = response.Items?.map((item: any) => ({
      name: item.name,
      active: item.active,
      hints: item.hints || [],
    })) || [];

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ categories }),
    };
  } catch (error) {
    console.error('Error getting categories:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ error: 'Failed to get categories' }),
    };
  }
}

async function updateCategory(event: APIGatewayProxyEvent, userId: string): Promise<APIGatewayProxyResult> {
  const body = JSON.parse(event.body || '{}') as UpdateCategoryRequest;
  const { name, active, hints } = body;

  if (!name || typeof name !== 'string') {
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ error: 'Category name is required' }),
    };
  }

  try {
    const updateExpression: string[] = [];
    const expressionAttributeValues: any = {};

    if (active !== undefined) {
      updateExpression.push('active = :active');
      expressionAttributeValues[':active'] = active;
    }

    if (hints !== undefined) {
      updateExpression.push('hints = :hints');
      expressionAttributeValues[':hints'] = hints;
    }

    updateExpression.push('updatedAt = :updatedAt');
    expressionAttributeValues[':updatedAt'] = new Date().toISOString();

    const command = new UpdateCommand({
      TableName: CATEGORIES_TABLE_NAME,
      Key: {
        pk: `USER#${userId}`,
        sk: `CATEGORY#${name}`,
      },
      UpdateExpression: `SET ${updateExpression.join(', ')}`,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW',
    });

    const result = await dynamoClient.send(command);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        updated: true,
        category: result.Attributes,
      }),
    };
  } catch (error) {
    console.error('Error updating category:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ error: 'Failed to update category' }),
    };
  }
}
