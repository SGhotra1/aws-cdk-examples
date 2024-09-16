import * as cdk from 'aws-cdk-lib';
import {Construct} from 'constructs';
import {Bucket} from "aws-cdk-lib/aws-s3";
import {BucketDeployment, Source} from "aws-cdk-lib/aws-s3-deployment";
import {aws_s3} from "aws-cdk-lib";
import {CfnAnalysis, CfnDataSet, CfnDataSource} from "aws-cdk-lib/aws-quicksight";
import {CfnManagedPolicy, ManagedPolicy, Role, ServicePrincipal} from "aws-cdk-lib/aws-iam";
import {readFileSync} from "node:fs";

export class QuicksightExampleStack extends cdk.Stack {
  public static MANIFEST_KEY =
    'manifests/manifest.json';

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);


    const bucketName = 'example-bucket';

    // Set up a bucket
    const bucket = new aws_s3.Bucket(this, bucketName, {
      accessControl: aws_s3.BucketAccessControl.BUCKET_OWNER_FULL_CONTROL,
      encryption: aws_s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: aws_s3.BlockPublicAccess.BLOCK_ALL
    });

    const quicksightservicerole = new Role(
      this, "aws-quicksight-service-role-v0",
      {
        roleName: "aws-quicksight-service-role-v0",
        assumedBy: new ServicePrincipal('quicksight.amazonaws.com'),
        description: 'quicksight role',
      }
    );

    const S3ReadOnly = ManagedPolicy.fromManagedPolicyArn(
      this,
      "s3quicksightPolicy",
      "arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess"
    );

    quicksightservicerole.addManagedPolicy(S3ReadOnly);

    const qs_import_mode = "SPICE";

    this.deployManifests(bucket);
    this.createManagedPolicyForQuicksight('quickSightPolicy', 'quickSightS3Policy', bucketName, [quicksightservicerole.roleName]);
    const qs_s3_datasource_name = "s3datasourceexample";
    const qs_s3_datasource = this.createDataSourceS3Type('S3DataSource', qs_s3_datasource_name, bucketName, QuicksightExampleStack.MANIFEST_KEY);
    const physicalColumns = readFileSync('physical-columns.json', 'utf-8');
    const physicalColumnsJson = JSON.parse(physicalColumns);

    const physical_table_columns = physicalColumnsJson["Internal"];
    const qs_s3_dataset_physical_tables_properties : CfnDataSet.PhysicalTableProperty = this.createS3PhysicalTableProperties(qs_s3_datasource.attrArn, physical_table_columns);
    const qs_dataset_created = this.createDataset('ExtractTelemetryFinal', "s3-extract-telemetry", qs_import_mode, {[qs_s3_datasource_name]: qs_s3_dataset_physical_tables_properties});
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

  createManagedPolicyForQuicksight(idManagedPolicy: string, namePolicy: string, bucketName: string, roles_quicksight: string[]): CfnManagedPolicy {
    return new CfnManagedPolicy(
      this,
      idManagedPolicy,
      {
        managedPolicyName: namePolicy,
        policyDocument: {
          "Statement": [
            {
              "Effect": "Allow",
              "Action": ["s3:ListAllMyBuckets"],
              "Resource": ["arn:aws:s3:::*"]
            },
            {
              "Effect": "Allow",
              "Action": ["s3:ListBucket"],
              "Resource": [
                `arn:aws:s3:::${bucketName}`
              ]
            },
            {
              "Effect": "Allow",
              "Action": [
                "s3:GetObject",
                "s3:List*"
              ],
              "Resource": [
                `arn:aws:s3:::${bucketName}/*`
              ]
            }
          ],
          "Version": "2012-10-17"
        },
        roles: roles_quicksight
      }
    );
  }

  createDataSourceS3Type(idDataSource: string, nameSource: string, bucketName: string, manifestKey: string): CfnDataSource {
    return new CfnDataSource(
      this,
      idDataSource,
      {
        awsAccountId: this.account,
        dataSourceId: nameSource,
        name: nameSource,
        dataSourceParameters: {
          s3Parameters: {
            manifestFileLocation: {
              bucket: bucketName,
              key: manifestKey
            }
          }
        },
        type: 'S3',
        sslProperties: {
          disableSsl: false
        }
      }
    )
  }

  createDataset(idDataset: string, datasetName: string, importMode: string, physical_table: Record<string, CfnDataSet.PhysicalTableProperty>): CfnDataSet {
    return new CfnDataSet(
      this,
      idDataset,
      {
        awsAccountId: this.account,
        physicalTableMap: physical_table,
        name: datasetName,
        dataSetId: datasetName,
        importMode: importMode
      }
    );
  }

  createAnalysis(idAnalysis: string, nameAnalysis: string, templateSourceArn: string, datasetCreatedArn: string, datasetPlaceholder: string): CfnAnalysis {
    return new CfnAnalysis(this, idAnalysis, {
      awsAccountId: this.account,
      name: nameAnalysis,
      analysisId: nameAnalysis,
      sourceEntity: {
        sourceTemplate: {
          arn: templateSourceArn,
          dataSetReferences: [
            {
              dataSetArn: datasetCreatedArn,
              dataSetPlaceholder: datasetPlaceholder
            }
          ]
        }
      },
    });
  }

  createS3PhysicalTableProperties(arnDataSourceCreated: string, inputColumns: CfnDataSet.InputColumnProperty[]) : CfnDataSet.PhysicalTableProperty{
    return {
      s3Source: {
        dataSourceArn: arnDataSourceCreated,
        inputColumns: inputColumns,
        uploadSettings: {
          format: 'CSV',
          delimiter: ',',
          containsHeader: true
        }
      }
    }
  }

}
