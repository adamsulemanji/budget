import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { FrontendConstruct } from "./cloudfront";
import { Pipeline } from "./pipeline-stack";

export class BudgetInfrastructureStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const frontend = new FrontendConstruct(this, 'BudgetFrontend');

    new Pipeline(this, 'BudgetPipeline', {
      frontendConstruct: frontend,
    })

  }
}
