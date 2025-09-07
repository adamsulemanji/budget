import { Context } from 'aws-lambda';
import {
  TextractClient,
  StartExpenseAnalysisCommand,
  GetExpenseAnalysisCommand,
  GetExpenseAnalysisCommandOutput,
  ExpenseDocument,
  ExpenseField,
  LineItemFields,
} from '@aws-sdk/client-textract';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

const textractClient = new TextractClient({});
const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const TRANSACTIONS_TABLE_NAME = process.env.TRANSACTIONS_TABLE_NAME!;
const RAW_STATEMENTS_BUCKET_NAME = process.env.RAW_STATEMENTS_BUCKET_NAME!;

interface StepFunctionInput {
  key: string;
  userId: string;
  issuer: string;
  cardLast4: string;
  statementId: string;
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

export const main = async (input: StepFunctionInput, _context: Context): Promise<ParseResult> => {
  try {
    if (!TRANSACTIONS_TABLE_NAME || !RAW_STATEMENTS_BUCKET_NAME) {
      throw new Error('Missing required env vars TRANSACTIONS_TABLE_NAME or RAW_STATEMENTS_BUCKET_NAME');
    }

    console.log('Starting expense analysis for:', JSON.stringify(input));

    // 1) Kick off async analysis
    const start = await textractClient.send(new StartExpenseAnalysisCommand({
      DocumentLocation: {
        S3Object: { Bucket: RAW_STATEMENTS_BUCKET_NAME, Name: input.key },
      },
    }));

    const jobId = start.JobId;
    if (!jobId) throw new Error('Textract StartExpenseAnalysis did not return a JobId');

    // 2) Poll for completion + collect all pages
    const allExpenseDocs: ExpenseDocument[] = await pollAndCollectExpenseDocs(jobId);

    // 3) Extract line items
    const lineItems: LineItem[] = extractAllLineItems(allExpenseDocs);

    console.log(`Total extracted line items: ${lineItems.length}`);

    // 4) Persist to DynamoDB
    const nowIso = new Date().toISOString();
    for (let i = 0; i < lineItems.length; i++) {
      const item = lineItems[i];
      const txnId = `${input.statementId}-${i}`;
      const dateKey = item.date || nowIso.split('T')[0];

      await dynamoClient.send(new PutCommand({
        TableName: TRANSACTIONS_TABLE_NAME,
        Item: {
          pk: `USER#${input.userId}`,
          sk: `DATE#${dateKey}#TXN#${txnId}`,
          statementId: input.statementId,
          issuer: input.issuer,
          cardLast4: input.cardLast4,
          merchantRaw: item.merchant,
          merchantNorm: item.merchant.toUpperCase().trim(),
          amount: item.amount,
          memo: item.memo ?? '',
          category: 'UNASSIGNED',
          confidence: 0,
          createdAt: nowIso,
        },
      }));
    }

    return { success: true, lineItems, input };
  } catch (err: any) {
    console.error('Error parsing statement:', err);
    return { success: false, lineItems: [], error: err?.message ?? String(err), input };
  }
};

/**
 * Polls GetExpenseAnalysis until JobStatus is SUCCEEDED or FAILED, and returns all ExpenseDocuments (across pages).
 */
async function pollAndCollectExpenseDocs(jobId: string): Promise<ExpenseDocument[]> {
  const maxWaitMs = 1000 * 60 * 4; // 4 minutes—adjust to your Lambda/Step Functions limits
  const start = Date.now();

  // First wait until job is complete (status SUCCEEDED / FAILED)
  // After completion, you still need to paginate through ALL pages via NextToken.
  let jobStatus = 'IN_PROGRESS';
  let lastStatusMsg = '';

  // Exponential backoff-ish polling
  let delayMs = 1500;
  while (jobStatus === 'IN_PROGRESS') {
    if (Date.now() - start > maxWaitMs) {
      throw new Error(`Textract job ${jobId} timed out while waiting for completion`);
    }
    await sleep(delayMs);
    delayMs = Math.min(Math.floor(delayMs * 1.5), 8000);

    const check = await textractClient.send(new GetExpenseAnalysisCommand({ JobId: jobId }));
    jobStatus = check.JobStatus ?? 'IN_PROGRESS';
    lastStatusMsg = check.StatusMessage ?? '';
    console.log(`Job ${jobId} status: ${jobStatus} ${lastStatusMsg ? `| ${lastStatusMsg}` : ''}`);

    if (jobStatus === 'FAILED' || jobStatus === 'PARTIAL_SUCCESS') {
      throw new Error(`Textract job ${jobId} failed or partial: ${lastStatusMsg || jobStatus}`);
    }
  }

  // Now paginate ALL results
  const docs: ExpenseDocument[] = [];
  let nextToken: string | undefined = undefined;

  do {
    const page: GetExpenseAnalysisCommandOutput = await textractClient.send(
      new GetExpenseAnalysisCommand({ JobId: jobId, NextToken: nextToken })
    );

    (page.ExpenseDocuments ?? []).forEach(d => docs.push(d));

    nextToken = page.NextToken;
  } while (nextToken);

  console.log(`Collected ${docs.length} ExpenseDocuments across all pages`);
  return docs;
}

function sleep(ms: number) {
  return new Promise(res => setTimeout(res, ms));
}

/**
 * Extracts line items across all ExpenseDocuments.
 */
function extractAllLineItems(expenseDocs: ExpenseDocument[]): LineItem[] {
  const results: LineItem[] = [];

  for (const expenseDoc of expenseDocs) {
    if (!expenseDoc.LineItemGroups) continue;

    for (const group of expenseDoc.LineItemGroups) {
      if (!group.LineItems) continue;

      for (const li of group.LineItems) {
        const extracted = extractLineItem(li.LineItemExpenseFields ?? []);
        if (extracted) results.push(extracted);
      }
    }
  }

  return results;
}

/**
 * Extracts a single LineItem from a set of LineItemExpenseFields.
 * Looks for TYPEs: ITEM (merchant), PRICE/AMOUNT (amount), DATE, DESCRIPTION (memo).
 */
function extractLineItem(fields: ExpenseField[]): LineItem | null {
  let merchant = '';
  let amount = 0;
  let date = '';
  let memo = '';

  for (const f of fields) {
    const type = f.Type?.Text?.toUpperCase();
    const text = f.ValueDetection?.Text ?? '';

    switch (type) {
      case 'ITEM':
      case 'VENDOR':
      case 'RECEIVER_NAME':
        if (!merchant && text) merchant = text;
        break;
      case 'PRICE':
      case 'AMOUNT':
      case 'TOTAL':
        if (text) {
          const n = parseFloat(text.replace(/[^0-9.\-]/g, ''));
          if (!Number.isNaN(n)) amount = n;
        }
        break;
      case 'DATE':
        if (!date && text) {
          // Normalize dates like 01/02/2025, 2025-01-02, etc. to YYYY-MM-DD when possible
          const norm = normalizeDate(text);
          date = norm || text;
        }
        break;
      case 'DESCRIPTION':
        if (text) memo = text;
        break;
      default:
        // ignore others
        break;
    }
  }

  // Fallback: if merchant still empty, pick first non-empty text field
  if (!merchant) {
    const firstText = fields.find(f => (f.ValueDetection?.Text ?? '').trim().length > 0);
    if (firstText?.ValueDetection?.Text) merchant = firstText.ValueDetection.Text;
  }

  if (!merchant || !amount) return null;

  return {
    date: date || new Date().toISOString().split('T')[0],
    merchant: merchant.trim(),
    amount,
    memo: memo.trim(),
  };
}

/**
 * Attempts to normalize common bank statement date formats to YYYY-MM-DD.
 */
function normalizeDate(raw: string): string | null {
  const s = raw.trim();

  // YYYY-MM-DD
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // MM/DD/YYYY or M/D/YYYY
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (us) {
    const mm = us[1].padStart(2, '0');
    const dd = us[2].padStart(2, '0');
    return `${us[3]}-${mm}-${dd}`;
  }

  // DD/MM/YYYY (some issuers use this)
  const eu = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(s);
  if (eu) {
    const dd = eu[1].padStart(2, '0');
    const mm = eu[2].padStart(2, '0');
    return `${eu[3]}-${mm}-${dd}`;
  }

  // Fallback: try Date.parse
  const t = Date.parse(s);
  if (!Number.isNaN(t)) {
    const d = new Date(t);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  }
  return null;
}