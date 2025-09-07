import { Context } from 'aws-lambda';
import { TextractClient, AnalyzeExpenseCommand } from '@aws-sdk/client-textract';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

const textractClient = new TextractClient({});
const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TRANSACTIONS_TABLE_NAME = process.env.TRANSACTIONS_TABLE_NAME!;
const RAW_STATEMENTS_BUCKET_NAME = process.env.RAW_STATEMENTS_BUCKET_NAME!;

interface StepFunctionInput {
  userId: string;
  statementId: string;
  key: string;
  issuer: string;
  cardLast4: string;
}

interface LineItem {
  date: string;
  merchant: string;
  amount: number;
  memo?: string;
}

interface ParseResult {
  success: boolean;
  lineItems: LineItem[];
  error?: string;
  input: StepFunctionInput;
}

export const main = async (input: StepFunctionInput, context: Context): Promise<ParseResult> => {
  try {
    console.log('Parsing statement:', input.key);

    // Call Textract AnalyzeExpense
    const command = new AnalyzeExpenseCommand({
      Document: {
        S3Object: {
          Bucket: RAW_STATEMENTS_BUCKET_NAME,
          Name: input.key,
        },
      },
    });

    const response = await textractClient.send(command);
    console.log('Textract response:', JSON.stringify(response, null, 2));

    // Extract line items from Textract response
    const lineItems: LineItem[] = [];
    
    if (response.ExpenseDocuments && response.ExpenseDocuments.length > 0) {
      for (const expenseDoc of response.ExpenseDocuments) {
        if (expenseDoc.LineItemGroups) {
          for (const lineItemGroup of expenseDoc.LineItemGroups) {
            if (lineItemGroup.LineItems) {
              for (const lineItem of lineItemGroup.LineItems) {
                const extractedItem = extractLineItem(lineItem);
                if (extractedItem) {
                  lineItems.push(extractedItem);
                }
              }
            }
          }
        }
      }
    }

    console.log('Extracted line items:', lineItems);

    // Store raw line items in DynamoDB for processing
    for (let i = 0; i < lineItems.length; i++) {
      const item = lineItems[i];
      const txnId = `${input.statementId}-${i}`;
      const dateKey = item.date || new Date().toISOString().split('T')[0];
      
      await dynamoClient.send(new PutCommand({
        TableName: TRANSACTIONS_TABLE_NAME,
        Item: {
          pk: `USER#${input.userId}`,
          sk: `DATE#${dateKey}#TXN#${txnId}`,
          statementId: input.statementId,
          merchantRaw: item.merchant,
          merchantNorm: item.merchant.toUpperCase().trim(),
          amount: item.amount,
          memo: item.memo || '',
          category: 'UNASSIGNED',
          confidence: 0,
          createdAt: new Date().toISOString(),
          issuer: input.issuer,
          cardLast4: input.cardLast4,
        },
      }));
    }

    return {
      success: true,
      lineItems,
      input,
    };
  } catch (error) {
    console.error('Error parsing statement:', error);
    return {
      success: false,
      lineItems: [],
      error: error instanceof Error ? error.message : 'Unknown error',
      input,
    };
  }
};

function extractLineItem(lineItem: any): LineItem | null {
  try {
    let merchant = '';
    let amount = 0;
    let date = '';
    let memo = '';

    // Extract merchant name
    if (lineItem.LineItemExpenseFields) {
      for (const field of lineItem.LineItemExpenseFields) {
        if (field.Type?.Text === 'ITEM') {
          merchant = field.ValueDetection?.Text || '';
        } else if (field.Type?.Text === 'PRICE') {
          const amountText = field.ValueDetection?.Text || '0';
          amount = parseFloat(amountText.replace(/[^0-9.-]/g, '')) || 0;
        } else if (field.Type?.Text === 'DATE') {
          date = field.ValueDetection?.Text || '';
        } else if (field.Type?.Text === 'DESCRIPTION') {
          memo = field.ValueDetection?.Text || '';
        }
      }
    }

    // If no merchant found, try to extract from other fields
    if (!merchant && lineItem.LineItemExpenseFields) {
      for (const field of lineItem.LineItemExpenseFields) {
        if (field.ValueDetection?.Text && !field.Type?.Text) {
          merchant = field.ValueDetection.Text;
          break;
        }
      }
    }

    // Skip if no merchant or amount
    if (!merchant || amount === 0) {
      return null;
    }

    return {
      date: date || new Date().toISOString().split('T')[0],
      merchant: merchant.trim(),
      amount,
      memo: memo.trim(),
    };
  } catch (error) {
    console.error('Error extracting line item:', error);
    return null;
  }
}
