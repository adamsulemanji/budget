import { DynamoDBStreamEvent, DynamoDBStreamHandler } from 'aws-lambda';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';

const s3Client = new S3Client({});
const ANALYTICS_BUCKET_NAME = process.env.ANALYTICS_BUCKET_NAME!;

export const main: DynamoDBStreamHandler = async (event: DynamoDBStreamEvent) => {
  try {
    console.log('Processing DynamoDB stream event:', JSON.stringify(event, null, 2));

    const records = event.Records.filter(record => {
      // Only process INSERT and MODIFY events
      return record.eventName === 'INSERT' || record.eventName === 'MODIFY';
    });

    if (records.length === 0) {
      console.log('No relevant records to process');
      return;
    }

    // Group records by date for efficient S3 storage
    const recordsByDate = new Map<string, any[]>();

    for (const record of records) {
      const newImage = record.dynamodb?.NewImage;
      if (!newImage) continue;

      // Extract date from the sort key (DATE#YYYY-MM-DD#TXN#...)
      const sortKey = newImage.sk?.S;
      if (!sortKey) continue;

      const dateMatch = sortKey.match(/DATE#(\d{4}-\d{2}-\d{2})/);
      if (!dateMatch) continue;

      const date = dateMatch[1];
      const [year, month, day] = date.split('-');

      const recordData = {
        eventName: record.eventName,
        timestamp: record.dynamodb?.ApproximateCreationDateTime || Date.now() / 1000,
        pk: newImage.pk?.S,
        sk: newImage.sk?.S,
        merchantRaw: newImage.merchantRaw?.S,
        merchantNorm: newImage.merchantNorm?.S,
        amount: parseFloat(newImage.amount?.N || '0'),
        memo: newImage.memo?.S,
        category: newImage.category?.S,
        confidence: parseFloat(newImage.confidence?.N || '0'),
        createdAt: newImage.createdAt?.S,
        updatedAt: newImage.updatedAt?.S,
        manuallyUpdated: newImage.manuallyUpdated?.BOOL || false,
        statementId: newImage.statementId?.S,
        issuer: newImage.issuer?.S,
        cardLast4: newImage.cardLast4?.S,
      };

      const dateKey = `${year}/${month}/${day}`;
      if (!recordsByDate.has(dateKey)) {
        recordsByDate.set(dateKey, []);
      }
      recordsByDate.get(dateKey)!.push(recordData);
    }

    // Write each date's records to S3 as JSONL
    for (const [dateKey, records] of recordsByDate) {
      const jsonlContent = records.map(record => JSON.stringify(record)).join('\n');
      const s3Key = `transactions/year=${dateKey.split('/')[0]}/month=${dateKey.split('/')[1]}/day=${dateKey.split('/')[2]}/${uuidv4()}.jsonl`;

      const command = new PutObjectCommand({
        Bucket: ANALYTICS_BUCKET_NAME,
        Key: s3Key,
        Body: jsonlContent,
        ContentType: 'application/x-ndjson',
      });

      await s3Client.send(command);
      console.log(`Wrote ${records.length} records to s3://${ANALYTICS_BUCKET_NAME}/${s3Key}`);
    }

    console.log(`Successfully processed ${records.length} records`);
  } catch (error) {
    console.error('Error processing DynamoDB stream:', error);
    throw error; // Re-throw to trigger Lambda retry
  }
};
