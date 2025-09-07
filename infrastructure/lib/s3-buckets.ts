import { RemovalPolicy } from 'aws-cdk-lib';
import { Bucket, BucketEncryption, HttpMethods } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export class S3Buckets extends Construct {
  public readonly rawStatementsBucket: Bucket;
  public readonly analyticsBucket: Bucket;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.rawStatementsBucket = new Bucket(this, 'RawStatementsBucket', {
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      encryption: BucketEncryption.S3_MANAGED,
      cors: [
        {
          // Allow browser-based uploads (PUT) from localhost and other origins during dev
          allowedMethods: [HttpMethods.PUT, HttpMethods.POST, HttpMethods.GET, HttpMethods.HEAD],
          allowedOrigins: ['*'],
          allowedHeaders: ['*'],
          exposedHeaders: ['ETag'],
          maxAge: 3000,
        },
      ],
    });

    this.analyticsBucket = new Bucket(this, 'AnalyticsBucket', {
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      encryption: BucketEncryption.S3_MANAGED,
    });
  }
}
