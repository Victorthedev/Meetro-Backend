const { CognitoIdentityProviderClient, AdminUpdateUserAttributesCommand } = require('@aws-sdk/client-cognito-identity-provider');
const dynamodb = new AWS.DynamoDB.DocumentClient();
const { NIGERIAN_STATES } = require('../../utils/constants');

const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });

exports.handler = async (event) => {
  try {
    const { name, state } = JSON.parse(event.body);
    const userId = event.requestContext.authorizer.claims.sub;
    const email = event.requestContext.authorizer.claims.email;

    if (state && !NIGERIAN_STATES.includes(state)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid Nigerian state' })
      };
    }

    const updates = {};
    if (name) updates.name = name;
    if (state) updates.state = state;
    updates.updatedAt = new Date().toISOString();

    const updatedUser = await dynamodb.update({
      TableName: process.env.USERS_TABLE,
      Key: { id: userId },
      UpdateExpression: 'SET ' + Object.keys(updates).map(k => `${k} = :${k}`).join(', '),
      ExpressionAttributeValues: Object.fromEntries(
        Object.entries(updates).map(([k, v]) => [`:${k}`, v])
      ),
      ReturnValues: 'ALL_NEW'
    }).promise();

    if (name) {
      await cognitoClient.send(new AdminUpdateUserAttributesCommand({
        UserPoolId: process.env.COGNITO_USER_POOL_ID,
        Username: email,
        UserAttributes: [
          { Name: 'name', Value: name }
        ]
      }));
    }

    return {
      statusCode: 200,
      body: JSON.stringify(updatedUser.Attributes)
    };
  } catch (error) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: error.message })
    };
  }
};