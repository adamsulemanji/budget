import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { FrontendConstruct } from "./cloudfront";
import { Pipeline } from "./pipeline-stack";
import { CategoriesTable } from "./categories-table";
import { DynamoDBTables } from "./dynamodb-tables";
import { S3Buckets } from "./s3-buckets";
import { LambdaFunctions } from "./lambda-functions";
import { StepFunctions } from "./step-functions";
import { ApiGateway } from "./api-gateway";

export class BudgetInfrastructureStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const frontend = new FrontendConstruct(this, 'BudgetFrontend');

    const categoriesTable = new CategoriesTable(this, 'CategoriesTable');
    const dynamoDBTables = new DynamoDBTables(this, 'DynamoDBTables');
    const s3Buckets = new S3Buckets(this, 'S3Buckets');

    const lambdaFunctions = new LambdaFunctions(this, 'LambdaFunctions', {
      rawStatementsBucket: s3Buckets.rawStatementsBucket,
      analyticsBucket: s3Buckets.analyticsBucket,
      statementsTable: dynamoDBTables.statementsTable,
      transactionsTable: dynamoDBTables.transactionsTable,
      categoriesTable: categoriesTable.table,
    });

    const stepFunctions = new StepFunctions(this, 'StepFunctions', {
      validateInputLambda: lambdaFunctions.validateInputLambda,
      parseStatementLambda: lambdaFunctions.parseStatementLambda,
      classifyWithBedrockLambda: lambdaFunctions.classifyWithBedrockLambda,
      markParsedLambda: lambdaFunctions.markParsedLambda,
      statementsTable: dynamoDBTables.statementsTable,
      startIngestLambda: lambdaFunctions.startIngestLambda,
    });

    new ApiGateway(this, 'ApiGateway', {
      getUploadUrlLambda: lambdaFunctions.getUploadUrlLambda,
      startIngestLambda: lambdaFunctions.startIngestLambda,
      updateLabelLambda: lambdaFunctions.updateLabelLambda,
      createCategoryLambda: lambdaFunctions.createCategoryLambda,
    });

    new Pipeline(this, 'BudgetPipeline', {
      frontendConstruct: frontend,
    });
  }
}
