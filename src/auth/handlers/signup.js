const { CognitoIdentityProviderClient, SignUpCommand, AdminUpdateUserAttributesCommand } = require('@aws-sdk/client-cognito-identity-provider');
const { putItem } = require('../../utils/db');
const { TABLE_NAMES } = require('../../utils/constants');
const logger = require('../../utils/logger');
const { v4: uuidv4 } = require('uuid');

const client = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });

exports.handler = async (event) => {
  try {
    const { email, password, firstName, lastName } = JSON.parse(event.body || '{}');
    if (!email || !password || !firstName || !lastName) {
      logger.error('Missing required fields', { fields: { email, password, firstName, lastName } });
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing required fields' }),
      };
    }

    const userId = uuidv4();

    const signUpCommand = new SignUpCommand({
      ClientId: process.env.COGNITO_CLIENT_ID,
      Username: email,
      Password: password,
      UserAttributes: [
        { Name: 'given_name', Value: firstName },
        { Name: 'family_name', Value: lastName },
      ],
    });
    await client.send(signUpCommand);

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
    });

    logger.info('Signup successful', { userId, email });
    return {
      statusCode: 200,
      body: JSON.stringify({ userId, message: 'Signup successful' }),
    };
  } catch (error) {
    logger.error('Signup error', { error: error.message, stack: error.stack });
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};