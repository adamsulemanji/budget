import { RemovalPolicy } from 'aws-cdk-lib';
import { AttributeType, BillingMode, ProjectionType, StreamViewType, Table } from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export class DynamoDBTables extends Construct {
  public readonly statementsTable: Table;
  public readonly transactionsTable: Table;
  public readonly categoriesTable: Table;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.statementsTable = new Table(this, 'StatementsTable',
      {
        partitionKey: { name: 'pk', type: AttributeType.STRING },
        sortKey: { name: 'sk', type: AttributeType.STRING },
        tableName: 'StatementsTable',
        billingMode: BillingMode.PAY_PER_REQUEST,
        removalPolicy: RemovalPolicy.DESTROY,
        stream: StreamViewType.NEW_AND_OLD_IMAGES,
      });

    this.transactionsTable = new Table(this, 'TransactionsTable',
      {
        partitionKey: { name: 'pk', type: AttributeType.STRING },
        sortKey: { name: 'sk', type: AttributeType.STRING },
        tableName: 'TransactionsTable',
        billingMode: BillingMode.PAY_PER_REQUEST,
        removalPolicy: RemovalPolicy.DESTROY,
        stream: StreamViewType.NEW_AND_OLD_IMAGES,
      });

    this.transactionsTable.addGlobalSecondaryIndex({
      indexName: 'by-statement-id',
      partitionKey: { name: 'statementId', type: AttributeType.STRING },
      sortKey: { name: 'sk', type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });

    this.transactionsTable.addGlobalSecondaryIndex({
      indexName: 'CategoryIndex',
      partitionKey: { name: 'gsi2pk', type: AttributeType.STRING },
      sortKey: { name: 'gsi2sk', type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });

    this.categoriesTable = new Table(this, 'CategoriesTable',
        {
          partitionKey: { name: 'pk', type: AttributeType.STRING },
          sortKey: { name: 'sk', type: AttributeType.STRING },
          tableName: 'CategoriesTable',
          billingMode: BillingMode.PAY_PER_REQUEST,
          removalPolicy: RemovalPolicy.DESTROY,
          stream: StreamViewType.NEW_AND_OLD_IMAGES,
        });
  }
}
