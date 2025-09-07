#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { Budget_InfrastructureStack } from '../lib/infrastructure-stack';

const app = new cdk.App();
new  Budget_InfrastructureStack(app, 'InfrastructureStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});