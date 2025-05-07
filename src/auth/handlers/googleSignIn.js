const { CognitoIdentityProviderClient, AdminCreateUserCommand, AdminUpdateUserAttributesCommand } = require('@aws-sdk/client-cognito-identity-provider');
const { putItem } = require('../../utils/db');
const { TABLE_NAMES } = require('../../utils/constants');
const { OAuth2Client } = require('google-auth-library');
const logger = require('../../utils/logger');
const { v4: uuidv4 } = require('uuid');

const client = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

exports.handler = async (event) => {
  try {
    const { idToken } = JSON.parse(event.body || '{}');
    if (!idToken) {
      logger.error('Missing Google ID token');
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing Google ID token' }),
      };
    }

    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const { email, given_name: firstName, family_name: lastName } = payload;

    if (!email || !firstName || !lastName) {
      logger.error('Invalid Google token payload', { payload });
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid Google token payload' }),
      };
    }

    const userId = uuidv4();

    const createCommand = new AdminCreateUserCommand({
      UserPoolId: process.env.COGNITO_USER_POOL_ID,
      Username: email,
      UserAttributes: [
        { Name: 'email', Value: email },
        { Name: 'given_name', Value: firstName },
        { Name: 'family_name', Value: lastName },
      ],
      TemporaryPassword: uuidv4(),
      MessageAction: 'SUPPRESS',
    });
    await client.send(createCommand);

    // Verify email using AdminUpdateUserAttributes
    const updateCommand = new AdminUpdateUserAttributesCommand({
      UserPoolId: process.env.COGNITO_USER_POOL_ID,
      Username: email,
      UserAttributes: [{ Name: 'email_verified', Value: 'true' }],
    });
    await client.send(updateCommand);

    await putItem(TABLE_NAMES.USERS, {
      userId,
      email,
      firstName,
      lastName,
      createdAt: new Date().toISOString(),
      googleLinked: true,
    });

    logger.info('Google sign-in successful', { userId, email });
    return {
      statusCode: 200,
      body: JSON.stringify({ userId, message: 'Google sign-in successful' }),
    };
  } catch (error) {
    logger.error('Google sign-in error', { error: error.message, stack: error.stack });
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};