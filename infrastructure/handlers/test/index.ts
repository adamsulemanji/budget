import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";

export const handler = async function (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  console.log("request:", JSON.stringify(event, undefined, 4));
  const stageName = process.env.STAGE_NAME!;
  return {
    statusCode: 200,
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({ message: "Successful lambda invocation" }),
  };
};