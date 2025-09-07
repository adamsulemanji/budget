import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { CfnStateMachine, InputType, StateMachine, StateMachineType } from 'aws-cdk-lib/aws-stepfunctions';
import { LambdaInvoke } from 'aws-cdk-lib/aws-stepfunctions-tasks';
import { Function } from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import { ITable } from 'aws-cdk-lib/aws-dynamodb';

interface StepFunctionsProps {
  validateInputLambda: Function;
  parseStatementLambda: Function;
  classifyWithBedrockLambda: Function;
  markParsedLambda: Function;
  statementsTable: ITable;
  startIngestLambda: Function;
}

export class StepFunctions extends Construct {
  public readonly stateMachine: StateMachine;

  constructor(scope: Construct, id: string, props: StepFunctionsProps) {
    super(scope, id);

    const {
      validateInputLambda,
      parseStatementLambda,
      classifyWithBedrockLambda,
      markParsedLambda,
      statementsTable,
    } = props;

    const validateInputTask = new LambdaInvoke(this, 'ValidateInput', {
      lambdaFunction: validateInputLambda,
      payloadResponseOnly: true,
      comment: 'Sanity checks on input',
    });

    const parseWithTextractTask = new LambdaInvoke(this, 'ParseWithTextract', {
      lambdaFunction: parseStatementLambda,
      payloadResponseOnly: true,
      comment: 'Extract line items using Textract AnalyzeExpense',
    });

    const classifyWithBedrockTask = new LambdaInvoke(this, 'ClassifyWithBedrock', {
      lambdaFunction: classifyWithBedrockLambda,
      payloadResponseOnly: true,
      comment: 'Classify all line items in one Bedrock call',
    });

    const markStatementParsedTask = new LambdaInvoke(this, 'MarkStatementParsed', {
      lambdaFunction: markParsedLambda,
      payloadResponseOnly: true,
      comment: 'Update statement status to PARSED',
    });

    const setStatementFailedTask = new LambdaInvoke(this, 'SetStatementFailed', {
      lambdaFunction: markParsedLambda, // Re-using markParsedLambda for setting FAILED status
      payload: {
        type: InputType.TEXT,
        value: '$.cause',
      },
      payloadResponseOnly: true,
      comment: 'Set statement status to FAILED on error',
    });

    const definition = validateInputTask
      .next(parseWithTextractTask)
      .next(classifyWithBedrockTask)
      .next(markStatementParsedTask);

    this.stateMachine = new StateMachine(this, 'StateMachine', {
      definition,
      stateMachineName: 'BudgetStatementProcessor',
      stateMachineType: StateMachineType.STANDARD,
      timeout: Duration.minutes(5),
    });

    // Grant the Step Functions state machine permission to update the StatementsTable
    statementsTable.grantWriteData(this.stateMachine);

    // Allow the state machine to invoke the Lambda functions
    this.stateMachine.addToRolePolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: [
        'lambda:InvokeFunction',
      ],
      resources: [
        validateInputLambda.functionArn,
        parseStatementLambda.functionArn,
        classifyWithBedrockLambda.functionArn,
        markParsedLambda.functionArn,
      ],
    }));

    // Add catch for errors to set statement status to FAILED
    validateInputTask.addCatch(setStatementFailedTask, { errors: ['States.ALL'] });
    parseWithTextractTask.addCatch(setStatementFailedTask, { errors: ['States.ALL'] });
    classifyWithBedrockTask.addCatch(setStatementFailedTask, { errors: ['States.ALL'] });

    // Update start-ingest Lambda with state machine ARN
    if (props.startIngestLambda) {
      props.startIngestLambda.addEnvironment(
        'STATE_MACHINE_ARN',
        this.stateMachine.stateMachineArn
      );
      this.stateMachine.grantStartExecution(props.startIngestLambda);
    }
  }
}
