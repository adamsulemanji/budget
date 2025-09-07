#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { BudgetInfrastructureStack } from '../lib/infrastructure-stack';

const app = new cdk.App();
new  BudgetInfrastructureStack(app, 'BudgetInfrastructureStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});