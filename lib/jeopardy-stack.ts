import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53Targets from 'aws-cdk-lib/aws-route53-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import {
  HttpApi,
  HttpMethod,
  HttpRouteKey,
  WebSocketApi,
  WebSocketStage,
  CorsHttpMethod,
} from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration, WebSocketLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { HttpUserPoolAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import * as path from 'path';

// ── Stack props ────────────────────────────────────────────────────────────────

export interface JeopardyStackProps extends cdk.StackProps {
  domainName: string;       // e.g. jeopardy.allmon.digital
  hostedZoneName: string;   // e.g. allmon.digital
}

// ── Stack ──────────────────────────────────────────────────────────────────────

export class JeopardyStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: JeopardyStackProps) {
    super(scope, id, props);

    const { domainName, hostedZoneName } = props;

    // ── Hosted Zone lookup ──────────────────────────────────────────────────
    const hostedZone = route53.HostedZone.fromLookup(this, 'HostedZone', {
      domainName: hostedZoneName,
    });

    // ── ACM Certificate (must be in us-east-1 for CloudFront) ──────────────
    const certificate = new acm.Certificate(this, 'Certificate', {
      domainName,
      validation: acm.CertificateValidation.fromDns(hostedZone),
    });

    // ── Cognito User Pool ───────────────────────────────────────────────────
    const userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: 'JeopardyHosts',
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: false,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool,
      userPoolClientName: 'JeopardyWebClient',
      authFlows: {
        userSrp: true,
      },
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [cognito.OAuthScope.EMAIL, cognito.OAuthScope.OPENID, cognito.OAuthScope.PROFILE],
        callbackUrls: [`https://${domainName}/`],
        logoutUrls: [`https://${domainName}/`],
      },
      preventUserExistenceErrors: true,
    });

    // ── DynamoDB — Sets table ───────────────────────────────────────────────
    const setsTable = new dynamodb.TableV2(this, 'SetsTable', {
      tableName: 'JeopardySets',
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billing: dynamodb.Billing.onDemand(),
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // ── DynamoDB — Games table ──────────────────────────────────────────────
    const gamesTable = new dynamodb.TableV2(this, 'GamesTable', {
      tableName: 'JeopardyGames',
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billing: dynamodb.Billing.onDemand(),
      timeToLiveAttribute: 'ttl',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      globalSecondaryIndexes: [
        {
          indexName: 'ConnIdIndex',
          partitionKey: { name: 'connId', type: dynamodb.AttributeType.STRING },
          projectionType: dynamodb.ProjectionType.ALL,
        },
      ],
    });

    // ── Shared Lambda environment + defaults ────────────────────────────────
    const commonLambdaProps: Partial<lambdaNodejs.NodejsFunctionProps> = {
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      timeout: cdk.Duration.seconds(15),
      memorySize: 256,
      bundling: {
        externalModules: ['@aws-sdk/*'],
        minify: true,
        sourceMap: false,
      },
      environment: {
        SETS_TABLE: setsTable.tableName,
        GAMES_TABLE: gamesTable.tableName,
      },
    };

    // ── Lambda — Sets CRUD ──────────────────────────────────────────────────
    const setsHandler = new lambdaNodejs.NodejsFunction(this, 'SetsHandler', {
      ...commonLambdaProps,
      entry: path.join(__dirname, '../lambda/sets/handler.ts'),
      handler: 'handler',
      functionName: 'JeopardySetsHandler',
    });
    setsTable.grantReadWriteData(setsHandler);

    // ── Lambda — Host Game ──────────────────────────────────────────────────
    const hostGameHandler = new lambdaNodejs.NodejsFunction(this, 'HostGameHandler', {
      ...commonLambdaProps,
      entry: path.join(__dirname, '../lambda/game/hostGame.ts'),
      handler: 'handler',
      functionName: 'JeopardyHostGame',
    });
    setsTable.grantReadData(hostGameHandler);
    gamesTable.grantReadWriteData(hostGameHandler);

    // ── Lambda — WebSocket Connect ──────────────────────────────────────────
    const wsConnectHandler = new lambdaNodejs.NodejsFunction(this, 'WsConnectHandler', {
      ...commonLambdaProps,
      entry: path.join(__dirname, '../lambda/websocket/connect.ts'),
      handler: 'handler',
      functionName: 'JeopardyWsConnect',
    });
    gamesTable.grantReadWriteData(wsConnectHandler);

    // ── Lambda — WebSocket Disconnect ───────────────────────────────────────
    const wsDisconnectHandler = new lambdaNodejs.NodejsFunction(this, 'WsDisconnectHandler', {
      ...commonLambdaProps,
      entry: path.join(__dirname, '../lambda/websocket/disconnect.ts'),
      handler: 'handler',
      functionName: 'JeopardyWsDisconnect',
    });
    gamesTable.grantReadWriteData(wsDisconnectHandler);

    // ── Lambda — WebSocket Message ──────────────────────────────────────────
    const wsMsgHandler = new lambdaNodejs.NodejsFunction(this, 'WsMsgHandler', {
      ...commonLambdaProps,
      entry: path.join(__dirname, '../lambda/websocket/message.ts'),
      handler: 'handler',
      functionName: 'JeopardyWsMessage',
      timeout: cdk.Duration.seconds(29),
    });
    gamesTable.grantReadWriteData(wsMsgHandler);

    // ── HTTP API (v2) ───────────────────────────────────────────────────────
    const httpApi = new HttpApi(this, 'HttpApi', {
      apiName: 'JeopardyHttpApi',
      corsPreflight: {
        allowOrigins: [
          `https://${domainName}`,
          'http://localhost:5173',
          'http://localhost:4173',
        ],
        allowMethods: [CorsHttpMethod.ANY],
        allowHeaders: ['Authorization', 'Content-Type'],
        maxAge: cdk.Duration.days(1),
      },
    });

    const cognitoAuthorizer = new HttpUserPoolAuthorizer('CognitoAuthorizer', userPool, {
      userPoolClients: [userPoolClient],
    });

    const setsIntegration = new HttpLambdaIntegration('SetsIntegration', setsHandler);
    const hostGameIntegration = new HttpLambdaIntegration('HostGameIntegration', hostGameHandler);

    // Sets CRUD routes (all require auth)
    const setRoutes: Array<{ path: string; method: HttpMethod }> = [
      { path: '/sets', method: HttpMethod.GET },
      { path: '/sets', method: HttpMethod.POST },
      { path: '/sets/{setId}', method: HttpMethod.GET },
      { path: '/sets/{setId}', method: HttpMethod.PUT },
      { path: '/sets/{setId}', method: HttpMethod.DELETE },
      { path: '/sets/{setId}/categories', method: HttpMethod.POST },
      { path: '/sets/{setId}/categories/{slug}', method: HttpMethod.PUT },
      { path: '/sets/{setId}/categories/{slug}', method: HttpMethod.DELETE },
    ];

    for (const route of setRoutes) {
      httpApi.addRoutes({
        path: route.path,
        methods: [route.method],
        integration: setsIntegration,
        authorizer: cognitoAuthorizer,
      });
    }

    httpApi.addRoutes({
      path: '/sets/{setId}/host',
      methods: [HttpMethod.POST],
      integration: hostGameIntegration,
      authorizer: cognitoAuthorizer,
    });

    // ── WebSocket API (v2) ──────────────────────────────────────────────────
    const wsApi = new WebSocketApi(this, 'WsApi', {
      apiName: 'JeopardyWsApi',
      connectRouteOptions: {
        integration: new WebSocketLambdaIntegration('WsConnectIntegration', wsConnectHandler),
      },
      disconnectRouteOptions: {
        integration: new WebSocketLambdaIntegration('WsDisconnectIntegration', wsDisconnectHandler),
      },
      defaultRouteOptions: {
        integration: new WebSocketLambdaIntegration('WsMsgIntegration', wsMsgHandler),
      },
    });

    const wsStage = new WebSocketStage(this, 'WsStage', {
      webSocketApi: wsApi,
      stageName: 'prod',
      autoDeploy: true,
    });

    // Grant message + disconnect Lambdas permission to push to WS clients
    const wsManagePolicy = new iam.PolicyStatement({
      actions: ['execute-api:ManageConnections'],
      resources: [
        `arn:aws:execute-api:${this.region}:${this.account}:${wsApi.apiId}/${wsStage.stageName}/*`,
      ],
    });
    wsMsgHandler.addToRolePolicy(wsManagePolicy);
    wsDisconnectHandler.addToRolePolicy(wsManagePolicy);

    // ── S3 Bucket — Frontend ────────────────────────────────────────────────
    const frontendBucket = new s3.Bucket(this, 'FrontendBucket', {
      bucketName: `jeopardy-frontend-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
    });

    // ── CloudFront — SPA + API proxy ────────────────────────────────────────
    const spaRewriteFn = new cloudfront.Function(this, 'SpaRewriteFn', {
      functionName: 'JeopardySpaRewrite',
      code: cloudfront.FunctionCode.fromInline(
        `function handler(event) {
  var uri = event.request.uri;
  if (uri.lastIndexOf('.') > uri.lastIndexOf('/')) return event.request;
  event.request.uri = '/index.html';
  return event.request;
}`
      ),
      runtime: cloudfront.FunctionRuntime.JS_2_0,
    });

    const httpApiOriginUrl = `${httpApi.apiId}.execute-api.${this.region}.amazonaws.com`;

    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: `Jeopardy — ${domainName}`,
      domainNames: [domainName],
      certificate,
      defaultRootObject: 'index.html',
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,

      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(frontendBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        functionAssociations: [
          {
            function: spaRewriteFn,
            eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
          },
        ],
      },

      additionalBehaviors: {
        '/api/*': {
          origin: new origins.HttpOrigin(httpApiOriginUrl, {
            protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        },
      },
    });

    // ── Route 53 — Alias record ─────────────────────────────────────────────
    new route53.ARecord(this, 'AliasRecord', {
      zone: hostedZone,
      recordName: domainName,
      target: route53.RecordTarget.fromAlias(new route53Targets.CloudFrontTarget(distribution)),
    });

    // ── Frontend deployment (builds frontend/dist into S3 + invalidates CF) ─
    new s3deploy.BucketDeployment(this, 'FrontendDeployment', {
      sources: [s3deploy.Source.asset(path.join(__dirname, '../frontend/dist'))],
      destinationBucket: frontendBucket,
      distribution,
      distributionPaths: ['/*'],
      memoryLimit: 512,
    });

    // ── Stack outputs ───────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'SiteUrl', {
      value: `https://${domainName}`,
      description: 'Frontend URL',
    });
    new cdk.CfnOutput(this, 'HttpApiUrl', {
      value: httpApi.apiEndpoint,
      description: 'HTTP API base URL (also proxied via CloudFront at /api)',
    });
    new cdk.CfnOutput(this, 'WsApiUrl', {
      value: wsStage.url,
      description: 'WebSocket URL — connect directly from the client',
    });
    new cdk.CfnOutput(this, 'UserPoolId', {
      value: userPool.userPoolId,
      description: 'Cognito User Pool ID',
    });
    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: userPoolClient.userPoolClientId,
      description: 'Cognito App Client ID',
    });
    new cdk.CfnOutput(this, 'FrontendBucketName', {
      value: frontendBucket.bucketName,
      description: 'S3 bucket — upload frontend dist here',
    });
    new cdk.CfnOutput(this, 'CloudFrontDistributionId', {
      value: distribution.distributionId,
      description: 'CloudFront distribution ID — use for cache invalidation after deploy',
    });
  }
}
