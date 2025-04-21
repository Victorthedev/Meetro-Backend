const AWS = require('aws-sdk');
const { CognitoIdentityProviderClient, SignUpCommand } = require('@aws-sdk/client-cognito-identity-provider');
const { v4: uuidv4 } = require('uuid');
const dynamodb = new AWS.DynamoDB.DocumentClient();
const { NIGERIAN_STATES } = require('../../utils/constants');

const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });

exports.handler = async (event) => {
  try {
    const { email, password, name, state } = JSON.parse(event.body);

    if (state && !NIGERIAN_STATES.includes(state)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid Nigerian state' })
      };
    }

    await cognitoClient.send(new SignUpCommand({
      ClientId: process.env.COGNITO_CLIENT_ID,
      Username: email,
      Password: password,
      UserAttributes: [
        { Name: 'email', Value: email },
        { Name: 'name', Value: name }
      ]
    }));

    const user = {
      id: uuidv4(),
      email,
      name,
      state: state || '',
      authProvider: 'email',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await dynamodb.put({
      TableName: process.env.USERS_TABLE,
      Item: user
    }).promise();

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, user })
    };
  } catch (error) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: error.message })
    };
  }
};