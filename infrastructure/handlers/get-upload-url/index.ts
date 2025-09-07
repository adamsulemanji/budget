import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';

const s3Client = new S3Client({});
const BUCKET_NAME = process.env.RAW_STATEMENTS_BUCKET_NAME!;
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
};

export const main = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {

    // Generate unique key for the PDF
    const key = `uploads/${uuidv4()}.pdf`;

    // Create presigned URL for PUT operation
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      ContentType: 'application/pdf',
    });

    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 }); // 1 hour

    return {
      statusCode: 200,
      headers: headers,
      body: JSON.stringify({
        uploadUrl,
        key,
      }),
    };
  } catch (error) {
    console.error('Error generating upload URL:', error);
    return {
      statusCode: 500,
      headers: headers,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
