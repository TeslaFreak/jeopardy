import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { JeopardyStack } from '../lib/jeopardy-stack';

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildStack() {
  const app = new cdk.App({
    context: {
      // Stub the hosted zone lookup so synth works without live AWS credentials
      'hosted-zone:account=123456789012:domainName=allmon.digital:region=us-east-1': {
        Id: '/hostedzone/FAKEZONEID',
        Name: 'allmon.digital.',
      },
    },
  });
  return new JeopardyStack(app, 'TestStack', {
    env: { account: '123456789012', region: 'us-east-1' },
    domainName: 'jeopardy.allmon.digital',
    hostedZoneName: 'allmon.digital',
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('JeopardyStack', () => {
  let template: Template;

  beforeAll(() => {
    template = Template.fromStack(buildStack());
  });

  test('creates two DynamoDB tables', () => {
    template.resourceCountIs('AWS::DynamoDB::GlobalTable', 2);
  });

  test('SetsTable has correct key schema', () => {
    template.hasResourceProperties('AWS::DynamoDB::GlobalTable', {
      TableName: 'JeopardySets',
      KeySchema: Match.arrayWith([
        { AttributeName: 'PK', KeyType: 'HASH' },
        { AttributeName: 'SK', KeyType: 'RANGE' },
      ]),
    });
  });

  test('GamesTable has TTL and ConnIdIndex GSI', () => {
    template.hasResourceProperties('AWS::DynamoDB::GlobalTable', {
      TableName: 'JeopardyGames',
      TimeToLiveSpecification: { AttributeName: 'ttl', Enabled: true },
      GlobalSecondaryIndexes: Match.arrayWith([
        Match.objectLike({ IndexName: 'ConnIdIndex' }),
      ]),
    });
  });

  test('creates Cognito User Pool', () => {
    template.hasResourceProperties('AWS::Cognito::UserPool', {
      UserPoolName: 'JeopardyHosts',
      AutoVerifiedAttributes: ['email'],
    });
  });

  test('creates five application Lambda functions', () => {
    // 5 app Lambdas + 2 CDK custom resource Lambdas (S3 autoDeleteObjects + BucketDeployment)
    template.resourceCountIs('AWS::Lambda::Function', 7);
  });

  test('creates HTTP API', () => {
    template.hasResourceProperties('AWS::ApiGatewayV2::Api', {
      Name: 'JeopardyHttpApi',
      ProtocolType: 'HTTP',
    });
  });

  test('creates WebSocket API', () => {
    template.hasResourceProperties('AWS::ApiGatewayV2::Api', {
      Name: 'JeopardyWsApi',
      ProtocolType: 'WEBSOCKET',
    });
  });

  test('creates CloudFront distribution with custom domain', () => {
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        Aliases: ['jeopardy.allmon.digital'],
        DefaultRootObject: 'index.html',
      }),
    });
  });

  test('creates Route 53 alias record', () => {
    template.hasResourceProperties('AWS::Route53::RecordSet', {
      Name: 'jeopardy.allmon.digital.',
      Type: 'A',
    });
  });

  test('emits required stack outputs', () => {
    const outputs = template.findOutputs('*');
    const outputKeys = Object.keys(outputs);
    expect(outputKeys).toContain('SiteUrl');
    expect(outputKeys).toContain('HttpApiUrl');
    expect(outputKeys).toContain('WsApiUrl');
    expect(outputKeys).toContain('UserPoolId');
    expect(outputKeys).toContain('UserPoolClientId');
  });
});

