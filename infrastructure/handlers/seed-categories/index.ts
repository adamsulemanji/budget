import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const CATEGORIES_TABLE_NAME = process.env.CATEGORIES_TABLE_NAME!;

const DEFAULT_CATEGORIES = [
  { name: 'GROCERIES', hints: ['SUPERMARKET', 'GROCERY', 'FOOD LION', 'KROGER', 'SAFEWAY'] },
  { name: 'DINING', hints: ['RESTAURANT', 'CAFE', 'STARBUCKS', 'MCDONALDS', 'SUBWAY'] },
  { name: 'SHOPPING', hints: ['AMAZON', 'WALMART', 'TARGET', 'BEST BUY', 'ONLINE'] },
  { name: 'TRANSPORTATION', hints: ['GAS', 'UBER', 'LYFT', 'PARKING', 'TOLL'] },
  { name: 'ENTERTAINMENT', hints: ['NETFLIX', 'SPOTIFY', 'MOVIE', 'CONCERT', 'GAME'] },
  { name: 'UTILITIES', hints: ['ELECTRIC', 'WATER', 'INTERNET', 'PHONE', 'CABLE'] },
  { name: 'RENT', hints: ['RENT', 'MORTGAGE', 'HOUSING'] },
  { name: 'TRAVEL', hints: ['HOTEL', 'AIRLINE', 'VACATION', 'TRIP'] },
  { name: 'HEALTHCARE', hints: ['DOCTOR', 'PHARMACY', 'CVS', 'WALGREENS', 'HOSPITAL'] },
  { name: 'INCOME', hints: ['SALARY', 'PAYROLL', 'DEPOSIT', 'REFUND'] },
  { name: 'TRANSFERS', hints: ['TRANSFER', 'PAYMENT', 'CREDIT'] },
  { name: 'UNASSIGNED', hints: [] },
];

export const main = async (event: any) => {
  try {
    const userId = event.userId || 'default-user';
    console.log(`Seeding categories for user: ${userId}`);

    for (const category of DEFAULT_CATEGORIES) {
      const command = new PutCommand({
        TableName: CATEGORIES_TABLE_NAME,
        Item: {
          pk: `USER#${userId}`,
          sk: `CATEGORY#${category.name}`,
          name: category.name,
          active: true,
          hints: category.hints,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });

      await dynamoClient.send(command);
      console.log(`Created category: ${category.name}`);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: `Successfully seeded ${DEFAULT_CATEGORIES.length} categories for user ${userId}`,
        categories: DEFAULT_CATEGORIES.map(c => c.name),
      }),
    };
  } catch (error) {
    console.error('Error seeding categories:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Failed to seed categories',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  }
};
