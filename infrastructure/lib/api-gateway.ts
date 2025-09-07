import { CfnOutput, RemovalPolicy } from 'aws-cdk-lib';
import { LambdaIntegration, RestApi, Cors, AuthorizationType, LambdaIntegrationOptions, IRestApi, Resource, Method, CfnGatewayResponse } from 'aws-cdk-lib/aws-apigateway';
import { IFunction } from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';

interface ApiGatewayProps {
  getUploadUrlLambda: IFunction;
  startIngestLambda: IFunction;
  updateLabelLambda: IFunction;
  createCategoryLambda: IFunction;
  testLambda: IFunction;
}

export class ApiGateway extends Construct {
  public readonly api: RestApi;

  constructor(scope: Construct, id: string, props: ApiGatewayProps) {
    super(scope, id);

    const { getUploadUrlLambda, startIngestLambda, updateLabelLambda, createCategoryLambda, testLambda } = props;

    this.api = new RestApi(this, 'BudgetApi', {
      restApiName: 'Budget Service',
      description: 'Service for budget tracking',
      defaultCorsPreflightOptions: {
        allowOrigins: ['*'],
        allowMethods: Cors.ALL_METHODS,
        allowHeaders: [
          'Content-Type',
          'X-Amz-Date',
          'Authorization',
          'X-Api-Key',
          'X-Amz-Security-Token',
        ],
        allowCredentials: true,
      },
    });

    // Testing endpoint
    const testResource = this.api.root.addResource('test');
    testResource.addMethod('GET', new LambdaIntegration(testLambda));


    const statementsResource = this.api.root.addResource('statements');
    const uploadResource = statementsResource.addResource('upload');
    const ingestResource = statementsResource.addResource('ingest');

    uploadResource.addMethod('GET', new LambdaIntegration(getUploadUrlLambda));

    ingestResource.addMethod('POST', new LambdaIntegration(startIngestLambda));

    const transactionsResource = this.api.root.addResource('transactions');
    const updateLabelResource = transactionsResource.addResource('update-label');

    updateLabelResource.addMethod('POST', new LambdaIntegration(updateLabelLambda));

    const categoriesResource = this.api.root.addResource('categories');
    categoriesResource.addMethod('POST', new LambdaIntegration(createCategoryLambda));

    new CfnOutput(this, 'ApiGatewayUrl', {
      value: this.api.url,
    });
  }
}
