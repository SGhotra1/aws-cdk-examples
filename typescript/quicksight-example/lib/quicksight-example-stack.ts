import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {Bucket} from "aws-cdk-lib/aws-s3";
import {BucketDeployment, Source} from "aws-cdk-lib/aws-s3-deployment";
import {aws_s3} from "aws-cdk-lib";

export class QuicksightExampleStack extends cdk.Stack {
  public static MANIFEST_KEY =
    'manifests/manifest.json';

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);


    // Set up a bucket
    const bucket = new aws_s3.Bucket(this, 'example-bucket', {
      accessControl: aws_s3.BucketAccessControl.BUCKET_OWNER_FULL_CONTROL,
      encryption: aws_s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: aws_s3.BlockPublicAccess.BLOCK_ALL
    });

    this.deployManifests(bucket);
  }
  public deployManifests(bucket: Bucket) {
    const manifest = QuicksightExampleStack.createS3Manifest(
      bucket.bucketName
    );
    // turn manifest JSON and s3 key into source object
    const sourceInternal = Source.jsonData(
      QuicksightExampleStack.MANIFEST_KEY,
      manifest
    );
    // deploy them
    new BucketDeployment(this, 'Bucketdeployment', {
      sources: [sourceInternal],
      destinationBucket: bucket,
    });
  }

  // Creates a very simple manifest JSON for the QuickSight S3 data source.
  public static createS3Manifest(s3BucketName: string): object {
    return {
      fileLocations: [
        {
          URIPrefixes: [`s3://${s3BucketName}`],
        },
      ],
      globalUploadSettings: {
        format: 'CSV',
        delimiter: ',',
      },
    };
  }
}
