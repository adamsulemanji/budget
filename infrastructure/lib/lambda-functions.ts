import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Architecture, Code, Function, Runtime, StartingPosition } from 'aws-cdk-lib/aws-lambda';
import { DynamoEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { IBucket } from 'aws-cdk-lib/aws-s3';
import { ITable } from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
import * as path from 'path';

interface LambdaFunctionsProps {
  rawStatementsBucket: IBucket;
  analyticsBucket: IBucket;
  statementsTable: ITable;
  transactionsTable: ITable;
  categoriesTable: ITable;
}

export class LambdaFunctions extends Construct {
  public readonly getUploadUrlLambda: Function;
  public readonly startIngestLambda: Function;
  public readonly validateInputLambda: Function;
  public readonly parseStatementLambda: Function;
  public readonly classifyWithBedrockLambda: Function;
  public readonly markParsedLambda: Function;
  public readonly updateLabelLambda: Function;
  public readonly transactionsToS3Lambda: Function;
  public readonly createCategoryLambda: Function;

  constructor(scope: Construct, id: string, props: LambdaFunctionsProps) {
    super(scope, id);

    const { rawStatementsBucket, analyticsBucket, statementsTable, transactionsTable, categoriesTable } = props;

    // Helper function to create NodejsFunction
    const createNodejsFunction = (name: string, handler: string, environment?: { [key: string]: string }) => {
      return new NodejsFunction(this, name, {
        runtime: Runtime.NODEJS_20_X,
        architecture: Architecture.X86_64,
        entry: path.join(__dirname, `../handlers/test/index.ts`),
        memorySize: 128,
        timeout: Duration.seconds(30),
        bundling: {
          minify: true,
          externalModules: [
            '@aws-sdk/client-s3',
            '@aws-sdk/s3-request-presigner',
            '@aws-sdk/client-textract',
            '@aws-sdk/client-bedrock-runtime',
            '@aws-sdk/client-dynamodb',
            '@aws-sdk/lib-dynamodb',
            '@aws-sdk/client-sfn',
            'aws-sdk',
          ],
        },
        environment: {
          STATEMENTS_TABLE_NAME: statementsTable.tableName,
          TRANSACTIONS_TABLE_NAME: transactionsTable.tableName,
          CATEGORIES_TABLE_NAME: categoriesTable.tableName,
          RAW_STATEMENTS_BUCKET_NAME: rawStatementsBucket.bucketName,
          ANALYTICS_BUCKET_NAME: analyticsBucket.bucketName,
          ...(environment || {}),
        },
      });
    };

    // get-upload-url Lambda
    this.getUploadUrlLambda = createNodejsFunction('GetUploadUrlLambda', 'get-upload-url.ts', {
      RAW_STATEMENTS_BUCKET_NAME: rawStatementsBucket.bucketName,
    });
    rawStatementsBucket.grantWrite(this.getUploadUrlLambda);

    // start-ingest Lambda
    this.startIngestLambda = createNodejsFunction('StartIngestLambda', 'start-ingest.ts');
    this.startIngestLambda.addToRolePolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['states:StartExecution'],
      resources: ['*'], // Will be narrowed down later with Step Functions ARN
    }));

    // validate-input Lambda
    this.validateInputLambda = createNodejsFunction('ValidateInputLambda', 'validate-input.ts');

    // parse-statement Lambda
    this.parseStatementLambda = createNodejsFunction('ParseStatementLambda', 'parse-statement.ts');
    rawStatementsBucket.grantRead(this.parseStatementLambda);
    transactionsTable.grantWriteData(this.parseStatementLambda);
    this.parseStatementLambda.addToRolePolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['textract:AnalyzeExpense'],
      resources: ['*'], // Textract does not have resource-level permissions for AnalyzeExpense
    }));

    // classify-with-bedrock Lambda
    this.classifyWithBedrockLambda = createNodejsFunction('ClassifyWithBedrockLambda', 'classify-with-bedrock.ts');
    categoriesTable.grantReadData(this.classifyWithBedrockLambda);
    transactionsTable.grantWriteData(this.classifyWithBedrockLambda);
    this.classifyWithBedrockLambda.addToRolePolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['bedrock:InvokeModel'],
      resources: ['arn:aws:bedrock:*:*:model/*'], // Will be narrowed down to specific model
    }));

    // mark-parsed Lambda
    this.markParsedLambda = createNodejsFunction('MarkParsedLambda', 'mark-parsed.ts');
    statementsTable.grantWriteData(this.markParsedLambda);

    // update-label Lambda
    this.updateLabelLambda = createNodejsFunction('UpdateLabelLambda', 'update-label.ts');
    transactionsTable.grantWriteData(this.updateLabelLambda);

    // transactions-to-s3 Lambda (DynamoDB Stream consumer)
    this.transactionsToS3Lambda = createNodejsFunction('TransactionsToS3Lambda', 'transactions-to-s3.ts');
    analyticsBucket.grantWrite(this.transactionsToS3Lambda);
    this.transactionsToS3Lambda.addEventSource(new DynamoEventSource(transactionsTable, {
      startingPosition: StartingPosition.LATEST,
    }));

    // create-category Lambda
    this.createCategoryLambda = createNodejsFunction('CreateCategoryLambda', 'create-category.ts');
    categoriesTable.grantWriteData(this.createCategoryLambda);
  }
}
