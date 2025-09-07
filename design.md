# Budget Tracker – Full Architecture Documentation (Bedrock Classifier)

---

## Overview

This is a **single-user budget tracker** built entirely on AWS. It supports:

- Uploading credit card statement PDFs.
- Parsing line items automatically with **Amazon Textract**.
- Classifying all transactions at once with **Amazon Bedrock** using a simple prompt.
- Allowing **manual overrides** of categories in the UI.
- Adding **custom categories** dynamically (stored in DynamoDB).
- Exporting all transaction data to **S3 (JSONL)** for analytics.
- Running on **AWS-native CI/CD** with CDK Pipelines (CodePipeline).
- Secured with **API Keys** (no Cognito required).

---

## Design Principles

- **Simplicity**: No heavy ML hosting or SageMaker endpoints; Bedrock is used directly from Lambda with a prompt.
- **Single user**: Protected by API key instead of Cognito.
- **Extensible**: Add categories, run retrains, or query analytics easily.
- **Cost-efficient**: Serverless-first architecture (S3, DynamoDB, Lambda, Step Functions).

---

## End-to-End Flow

1. **Upload**
   - UI calls `POST /statements/upload`.
   - Backend Lambda returns a **presigned S3 URL**.
   - UI uploads PDF to **RawStatementsBucket**.

2. **Ingest**
   - UI calls `POST /statements/ingest` with `{ key, userId, issuer, cardLast4 }`.
   - Step Functions starts workflow.

3. **Parse**
   - Step Functions step `ParseWithTextract` calls Textract `AnalyzeExpense`.
   - Extracted line items: `{ date, merchant, amount, memo? }`.

4. **Classify**
   - Step `ClassifyWithBedrock` Lambda:
     - Reads active categories from **CategoriesTable**.
     - Builds a structured prompt with all line items.
     - Calls **Bedrock InvokeModel** (Claude/Titan/etc.).
     - Returns JSON with `{ index, category, confidence }` for each line item.
     - Writes results to **TransactionsTable**.

5. **Mark Parsed**
   - Updates **StatementsTable** to mark statement as `PARSED`.

6. **User Actions**
   - **Override label**: `POST /transactions/update-label` updates category for a specific txn.
   - **Add category**: `POST /categories` adds a new label to CategoriesTable. Future runs include it.

7. **Analytics**
   - DynamoDB Streams → Lambda → S3 **AnalyticsBucket**.
   - Data stored as **JSONL** with partitions: `year=/month=/day=`.

---

## AWS Components

### Storage

- **S3 Buckets**
  - `RawStatementsBucket`: PDFs (input).
  - `AnalyticsBucket`: JSONL exports (analytics).

- **DynamoDB Tables**
  - `StatementsTable`
    - Key: `pk=USER#{userId}`, `sk=STATEMENT#{statementId}`
    - Attributes: `s3Key`, `status`, `issuer`, `cardLast4`
  - `TransactionsTable`
    - Key: `pk=USER#{userId}`, `sk=DATE#YYYY-MM-DD#TXN#{txnId}`
    - Attributes: `merchantRaw`, `merchantNorm`, `amount`, `memo`, `category`, `confidence`
    - GSI: `CategoryIndex` for filtering by category
  - `CategoriesTable`
    - Key: `pk=USER#{userId}`, `sk=CATEGORY#{name}`
    - Attributes: `name`, `active`, `hints`

### Compute & Orchestration

- **Lambda Functions**
  - `get-upload-url` → returns presigned S3 URL.
  - `start-ingest` → kicks off Step Functions.
  - `validate-input` → sanity checks.
  - `parse-statement` → Textract parsing.
  - `classify-with-bedrock` → calls Bedrock with all line items.
  - `mark-parsed` → finalizes statement.
  - `update-label` → manual category override.
  - `transactions-to-s3` → DynamoDB stream → S3 JSONL.

- **Step Functions Workflow**

ValidateInput → ParseWithTextract → ClassifyWithBedrock → MarkStatementParsed

- **Bedrock**
- Any supported text model.
- Invoked from Lambda with `bedrock:InvokeModel` IAM permission.

### Networking & Frontend

- **API Gateway**
- Endpoints:
  - `POST /statements/upload`
  - `POST /statements/ingest`
  - `POST /transactions/update-label`
  - `POST /categories`
- All require **x-api-key** header.

- **Frontend**
- Static SPA (React/Next.js).
- Hosted on **S3 + CloudFront** with custom domain (Route53 + ACM).

### CI/CD

- **CDK Pipelines (CodePipeline)**:
- Synth & deploy infra.
- Build & publish frontend → S3.
- CloudFront invalidation.

---

## API Reference

### `POST /statements/upload`
Get presigned URL to upload PDF.

**Response**
```json
{ "uploadUrl": "https://s3-presigned-url", "key": "uploads/1701234567890.pdf" }


⸻

POST /statements/ingest

Kick off parsing workflow.

Request

{ "key": "uploads/1701234567890.pdf", "userId": "me", "issuer": "Chase", "cardLast4": "1234" }

Response

{ "executionArn": "arn:aws:states:..." }


⸻

POST /transactions/update-label

Override a category.

Request

{ "userId": "me", "txnId": "DATE#2025-09-01#TXN#abc123", "newCategory": "GROCERIES" }

Response

{ "updated": true, "category": "GROCERIES" }


⸻

POST /categories

Add a new category.

Request

{ "name": "HEALTHCARE", "hints": ["CVS", "WALGREENS"] }

Response

{ "created": true }


⸻

Step Functions Data Flow

Input

{
  "userId": "me",
  "statementId": "uuid",
  "cardLast4": "1234",
  "issuer": "Chase",
  "lineItems": [
    { "date": "2025-09-01", "merchant": "AMZN Mktp", "amount": 19.99 },
    { "date": "2025-09-02", "merchant": "STARBUCKS", "amount": 5.75 }
  ]
}

Bedrock Prompt

System Prompt

You are a budgeting assistant. Categorize each transaction using ONLY the provided categories. 
Return valid JSON. If unsure, select "UNASSIGNED". No extra text.

User Prompt

CATEGORIES:
- GROCERIES
- DINING
- SHOPPING
- TRANSPORTATION
- ENTERTAINMENT
- UTILITIES
- RENT
- TRAVEL
- HEALTHCARE
- INCOME
- TRANSFERS
- UNASSIGNED

TASK:
For each line item, choose the best category.

OUTPUT SCHEMA:
{ "items": [ { "index": 0, "category": "CATEG", "confidence": 0.0 } ] }

LINE ITEMS:
0 | AMZN Mktp | $19.99
1 | STARBUCKS | $5.75

Expected Bedrock Response

{
  "items": [
    { "index": 0, "category": "SHOPPING", "confidence": 0.86 },
    { "index": 1, "category": "DINING", "confidence": 0.92 }
  ]
}


⸻

DynamoDB Data Shapes

Transactions

{
  "pk": "USER#me",
  "sk": "DATE#2025-09-01#TXN#abc123",
  "merchantRaw": "AMZN Mktp",
  "merchantNorm": "AMZN MKTP",
  "amount": 19.99,
  "memo": "Order #123",
  "category": "SHOPPING",
  "confidence": 0.86,
  "createdAt": "2025-09-01T19:45:10Z"
}

Categories

{
  "pk": "USER#me",
  "sk": "CATEGORY#SHOPPING",
  "name": "SHOPPING",
  "active": true,
  "hints": ["AMAZON", "WALMART"]
}


⸻

Analytics Pipeline
	•	Stream source: DynamoDB Transactions table.
	•	Consumer Lambda: Converts inserts/updates into JSONL.
	•	Target: s3://AnalyticsBucket/transactions/year=2025/month=09/day=06/xxxx.jsonl
	•	Use Athena to query with SQL.

Example Athena DDL

CREATE EXTERNAL TABLE IF NOT EXISTS budget_transactions (
  pk string,
  sk string,
  merchantNorm string,
  merchantRaw string,
  amount double,
  category string,
  confidence double,
  createdAt string
)
PARTITIONED BY (year string, month string, day string)
ROW FORMAT SERDE 'org.openx.data.jsonserde.JsonSerDe'
LOCATION 's3://<ANALYTICS_BUCKET>/transactions/';

Run:

MSCK REPAIR TABLE budget_transactions;


⸻

Security
	•	API Keys for all requests.
	•	Private S3 buckets; only presigned URLs used.
	•	KMS encryption on S3 and DynamoDB.
	•	CloudFront OAC for frontend bucket.

⸻

ASCII Diagram

[SPA (CloudFront)] --x-api-key--> [API Gateway]
   | /statements/upload  /statements/ingest  /transactions/update-label  /categories
   |       |                       |                   |                      |
   v       v                       v                   v                      v
[S3 Raw] [Lambda get-upload-url] [Lambda start-ingest] [Lambda update-label] [Lambda categories]
                                          |
                                          v
                                   [Step Functions]
                                ┌───────┴────────┐
                                v                v
                        [ParseWithTextract]   [Validate]
                                |
                                v
                       [ClassifyWithBedrock]
                                |
                                v
                       [DynamoDB Transactions]
                                |
                                v
                       [MarkStatementParsed]
                                |
                                v
                       [DynamoDB Statements]

[DynamoDB Streams] ---> [Lambda stream→S3] ---> [S3 Analytics JSONL]


⸻

Rollout Checklist
	•	Deploy infra via CDK Pipelines.
	•	Populate CategoriesTable with starter labels (include UNASSIGNED).
	•	Set API Key in frontend.
	•	Upload sample PDF and test classification.
	•	Try manual override and new category.
	•	Verify Analytics JSONL in S3.
	•	(Optional) Hook Athena to query transactions.

⸻


