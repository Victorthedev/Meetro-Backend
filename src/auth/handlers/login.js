const { CognitoIdentityProviderClient, InitiateAuthCommand } = require('@aws-sdk/client-cognito-identity-provider');
const logger = require('../../utils/logger');

const client = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });

exports.handler = async (event) => {
  try {
    const { email, password } = JSON.parse(event.body || '{}');
    if (!email || !password) {
      logger.error('Missing email or password');
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing email or password' }),
      };
    }

    const command = new InitiateAuthCommand({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: process.env.COGNITO_CLIENT_ID,
      AuthParameters: {
        USERNAME: email,
        PASSWORD: password,
      },
    });

    const response = await client.send(command);
    const { AuthenticationResult } = response;

    if (!AuthenticationResult) {
      logger.error('Authentication failed', { email });
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Invalid credentials' }),
      };
    }

    logger.info('Login successful', { email });
    return {
      statusCode: 200,
      body: JSON.stringify({
        idToken: AuthenticationResult.IdToken,
        accessToken: AuthenticationResult.AccessToken,
        refreshToken: AuthenticationResult.RefreshToken,
      }),
    };
  } catch (error) {
    logger.error('Login error', { error: error.message, stack: error.stack });
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};