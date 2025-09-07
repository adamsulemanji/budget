import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
import { v4 as uuidv4 } from 'uuid';
import { stat } from 'fs';

const sfnClient = new SFNClient({});
const STATE_MACHINE_ARN = process.env.STATE_MACHINE_ARN!;
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
};


interface IngestRequest {
  key: string;
  userId: string;
  issuer: string;
  cardLast4: string;
}

export const main = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {

    // Parse request body
    const body = JSON.parse(event.body || '{}') as IngestRequest;
    const { key, userId, issuer, cardLast4 } = body;

    // Validate required fields
    if (!key || !userId || !issuer || !cardLast4) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ error: 'Missing required fields: key, userId, issuer, cardLast4' }),
      };
    }

    // Create statement ID
    const statementId = uuidv4();


    // Prepare Step Functions input
    const input = {
      ...body,
      statementId,
    };

    // Start Step Functions execution
    const command = new StartExecutionCommand({
      stateMachineArn: STATE_MACHINE_ARN,
      name: `statement-${statementId}`,
      input: JSON.stringify(input),
    });

    const result = await sfnClient.send(command);

    return {
      statusCode: 200,
      headers: headers,
      body: JSON.stringify({
        executionArn: result.executionArn,
        statementId,
      }),
    };
  } catch (error) {
    console.error('Error starting ingest workflow:', error);
    return {
      statusCode: 500,
      headers: headers,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
