const { CognitoIdentityProviderClient, InitiateAuthCommand } = require('@aws-sdk/client-cognito-identity-provider');
const dynamodb = new AWS.DynamoDB.DocumentClient();

const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });

exports.handler = async (event) => {
  try {
    const { email, password } = JSON.parse(event.body);

    const { AuthenticationResult } = await cognitoClient.send(
      new InitiateAuthCommand({
        AuthFlow: 'USER_PASSWORD_AUTH',
        ClientId: process.env.COGNITO_CLIENT_ID,
        AuthParameters: {
          USERNAME: email,
          PASSWORD: password
        }
      })
    );

    const user = await dynamodb.get({
      TableName: process.env.USERS_TABLE,
      Key: { email }
    }).promise();

    if (!user.Item) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'User not found' })
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        token: AuthenticationResult.IdToken,
        user: {
          id: user.Item.id,
          name: user.Item.name,
          email: user.Item.email,
          state: user.Item.state,
          profilePicture: user.Item.profilePicture,
          calendarType: user.Item.calendarType
        }
      })
    };
  } catch (error) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: error.message })
    };
  }
};