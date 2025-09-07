import { CfnOutput, RemovalPolicy } from 'aws-cdk-lib';
import { LambdaIntegration, RestApi, Cors, AuthorizationType, LambdaIntegrationOptions, IRestApi, Resource, Method } from 'aws-cdk-lib/aws-apigateway';
import { IFunction } from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';

interface ApiGatewayProps {
  getUploadUrlLambda: IFunction;
  startIngestLambda: IFunction;
  updateLabelLambda: IFunction;
  createCategoryLambda: IFunction;
}

export class ApiGateway extends Construct {
  public readonly api: RestApi;

  constructor(scope: Construct, id: string, props: ApiGatewayProps) {
    super(scope, id);

    const { getUploadUrlLambda, startIngestLambda, updateLabelLambda, createCategoryLambda } = props;

    this.api = new RestApi(this, 'BudgetApi', {
      restApiName: 'Budget Service',
      description: 'Service for budget tracking',
      defaultCorsPreflightOptions: {
        allowOrigins: Cors.ALL_ORIGINS,
        allowMethods: Cors.ALL_METHODS,
      },
      deployOptions: {
        stageName: 'dev',
      },
    });


    const statementsResource = this.api.root.addResource('statements');
    const uploadResource = statementsResource.addResource('upload');
    const ingestResource = statementsResource.addResource('ingest');

    uploadResource.addMethod('POST', new LambdaIntegration(getUploadUrlLambda), {
      apiKeyRequired: true,
    });

    ingestResource.addMethod('POST', new LambdaIntegration(startIngestLambda), {
      apiKeyRequired: true,
    });

    const transactionsResource = this.api.root.addResource('transactions');
    const updateLabelResource = transactionsResource.addResource('update-label');

    updateLabelResource.addMethod('POST', new LambdaIntegration(updateLabelLambda), {
      apiKeyRequired: true,
    });

    const categoriesResource = this.api.root.addResource('categories');
    categoriesResource.addMethod('POST', new LambdaIntegration(createCategoryLambda), {
      apiKeyRequired: true,
    });

    new CfnOutput(this, 'ApiGatewayUrl', {
      value: this.api.url,
    });
  }
}
