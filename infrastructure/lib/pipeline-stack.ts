import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as codepipeline from "aws-cdk-lib/aws-codepipeline";
import * as codepipeline_actions from "aws-cdk-lib/aws-codepipeline-actions";
import * as codebuild from "aws-cdk-lib/aws-codebuild";
import * as iam from "aws-cdk-lib/aws-iam";

import { FrontendConstruct } from "./cloudfront";

export interface PipelineStackProps {
  frontendConstruct: FrontendConstruct;
}

export class Pipeline extends Construct {
  constructor(scope: Construct, id: string, props?: PipelineStackProps) {
    super(scope, id);

    // ********** ARTIFACTS **********
    const sourceOutput = new codepipeline.Artifact("SourceOutput");
    const synthOutput = new codepipeline.Artifact("SynthOutput");
    const frontendBuildOutput = new codepipeline.Artifact(
      "FrontendBuildOutput"
    );

    // ********** GITHUB SOURCE ACTION **********
    const sourceAction = new codepipeline_actions.GitHubSourceAction({
      actionName: "GitHub_Source",
      owner: "adamsulemanji",
      repo: "budget",
      oauthToken: cdk.SecretValue.secretsManager("github_token2"),
      output: sourceOutput,
      branch: "main",
      trigger: codepipeline_actions.GitHubTrigger.WEBHOOK,
    });

    // ********** SYNTH PROJECT (for CDK infra) **********
    const synthProject = new codebuild.PipelineProject(this, "SynthProject", {
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
        privileged: true,
      },
      buildSpec: codebuild.BuildSpec.fromObjectToYaml({
        version: "0.2",
        phases: {
          install: {
            runtimeVersions: {
              nodejs: "20",
            },
            commands: ["npm install -g aws-cdk", "npm install --legacy-peer-deps"],
          },
          pre_build: {
            commands: ["node --version", "npm --version", "cdk --version"],
          },
          build: {
            commands: ["cdk synth -o dist"],
          },
        },
        artifacts: {
          "base-directory": "dist",
          files: ["**/*"],
        },
      }),
    });

    synthProject.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "cloudformation:DescribeStacks",
          "cloudformation:CreateChangeSet",
          "cloudformation:ExecuteChangeSet",
          "cloudformation:DeleteChangeSet",
          "cloudformation:DescribeChangeSet",
          "s3:*",
          "sts:AssumeRole",
          "iam:PassRole",
        ],
        resources: ["*"],
      })
    );

    // ********** SYNTH ACTION **********
    const synthAction = new codepipeline_actions.CodeBuildAction({
      actionName: "CDK_Synth",
      project: synthProject,
      input: sourceOutput,
      outputs: [synthOutput],
    });

    // ********** FRONTEND BUILD PROJECT **********
    const frontendBuildProject = new codebuild.PipelineProject(
      this,
      "FrontendBuildProject",
      {
        environment: {
          buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
        },
        buildSpec: codebuild.BuildSpec.fromObjectToYaml({
          version: "0.2",
          phases: {
            install: {
              commands: ["cd ../frontend", "npm install --force"],
            },
            build: {
              commands: ["npm run build"],
            },
          },
          artifacts: {
            "base-directory": "../frontend/build",
            files: ["**/*"],
          },
        }),
      }
    );

    // ********** FRONTEND BUILD ACTION **********
    const buildFrontendAction = new codepipeline_actions.CodeBuildAction({
      actionName: "Build_Frontend",
      project: frontendBuildProject,
      input: sourceOutput,
      outputs: [frontendBuildOutput],
    });

    // ********** DEPLOY INFRA ACTION (CloudFormation) **********
    const deployInfraAction =
      new codepipeline_actions.CloudFormationCreateUpdateStackAction({
        actionName: "CFN_Deploy",
        stackName: "BudgetStack",
        templatePath: synthOutput.atPath("BudgetStack.template.json"),
        adminPermissions: true,
        cfnCapabilities: [cdk.CfnCapabilities.NAMED_IAM],
      });

    // ********** DEPLOY FRONTEND ACTION (S3) **********
    const deployFrontendAction = new codepipeline_actions.S3DeployAction({
      actionName: "Deploy_Frontend_To_S3",
      bucket: props?.frontendConstruct.bucket as cdk.aws_s3.IBucket,
      input: frontendBuildOutput,
    });

    // ********** PIPELINE DEFINITION **********
    new codepipeline.Pipeline(this, "BudgetPipeline", {
      pipelineName: "BudgetPipeline",
      stages: [
        {
          stageName: "Source",
          actions: [sourceAction],
        },
        {
          stageName: "Synth",
          actions: [synthAction],
        },
        {
          stageName: "BuildFrontend",
          actions: [buildFrontendAction],
        },
        {
          stageName: "DeployInfra",
          actions: [deployInfraAction],
        },
        {
          stageName: "DeployFrontend",
          actions: [deployFrontendAction],
        },
      ],
    });
  }
}
