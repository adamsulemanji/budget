import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
};

export const main = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
  
    return {
      statusCode: 200,
      headers: headers,
      body: JSON.stringify({
        success: true,
      }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: headers,
      body: JSON.stringify({ error: 'Internal server error with Test Lambda' }),
    };
  }
};
