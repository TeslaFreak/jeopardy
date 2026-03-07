#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { JeopardyStack } from '../lib/jeopardy-stack';

const app = new cdk.App();
new JeopardyStack(app, 'JeopardyStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'us-east-1',
  },
  domainName: 'jeopardy.allmon.digital',
  hostedZoneName: 'allmon.digital',
});