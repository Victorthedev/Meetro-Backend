const { CognitoIdentityProviderClient, SignUpCommand, AdminUpdateUserAttributesCommand } = require('@aws-sdk/client-cognito-identity-provider');
const { AdminConfirmSignUpCommand } = require('@aws-sdk/client-cognito-identity-provider'); // Note the correct command name
const { putItem } = require('../../utils/db');
const { TABLE_NAMES } = require('../../utils/constants');
const { v4: uuidv4 } = require('uuid');

const client = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });

exports.handler = async (event) => {
  try {
    console.log('Full event:', JSON.stringify(event, null, 2));
    console.log('Raw event.body:', event.body);
    const body = typeof event.body === 'string' ? JSON.parse(event.body || '{}') : event.body || {};
    const { email, password, firstName, lastName } = body;
    console.log('Parsed fields:', { email, password, firstName, lastName });

    if (!email || !password || !firstName || !lastName) {
      console.error('Missing required fields', { email, password, firstName, lastName });
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

    // Auto-confirm the user - using the correct command name
    const confirmCommand = new AdminConfirmSignUpCommand({
      UserPoolId: process.env.COGNITO_USER_POOL_ID,
      Username: email,
    });
    await client.send(confirmCommand);

    await putItem(TABLE_NAMES.USERS, {
      userId,
      email,
      firstName,
      lastName,
      createdAt: new Date().toISOString(),
    });

    console.log('Signup successful', { userId, email });
    return {
      statusCode: 200,
      body: JSON.stringify({ userId, message: 'Signup successful' }),
    };
  } catch (error) {
    console.error('Signup error', { 
      error: error.message, 
      stack: error.stack 
    });
    if (error.name === 'UsernameExistsException') {
      return {
        statusCode: 409,
        body: JSON.stringify({ error: 'User already exists' }),
      };
    }
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};