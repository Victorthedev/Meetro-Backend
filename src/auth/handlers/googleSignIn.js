const { 
    CognitoIdentityProviderClient, 
    AdminCreateUserCommand,
    AdminInitiateAuthCommand,  // Added for authentication
    AdminUpdateUserAttributesCommand,
    AdminSetUserPasswordCommand
  } = require('@aws-sdk/client-cognito-identity-provider');
  const { putItem } = require('../../utils/db');
  const { TABLE_NAMES } = require('../../utils/constants');
  const { OAuth2Client } = require('google-auth-library');
  const { v4: uuidv4 } = require('uuid');
  
  const client = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });
  const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
  
  exports.handler = async (event) => {
    try {
      const body = typeof event.body === 'string' ? JSON.parse(event.body || '{}') : event.body || {};
      const { idToken } = body;
  
      if (!idToken) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Missing Google ID token' }) };
      }
  
      // Verify Google token
      const ticket = await googleClient.verifyIdToken({ idToken, audience: process.env.GOOGLE_CLIENT_ID });
      const payload = ticket.getPayload();
      const { email, given_name: firstName, family_name: lastName } = payload;
  
      if (!email || !firstName || !lastName) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Invalid Google token payload' }) };
      }
  
      const userId = uuidv4();
      const randomPassword = `G00gle${Math.random().toString(36).slice(-8)}!`;
  
      // Step 1: Create user in Cognito
      await client.send(new AdminCreateUserCommand({
        UserPoolId: process.env.COGNITO_USER_POOL_ID,
        Username: email,
        UserAttributes: [
          { Name: 'email', Value: email },
          { Name: 'given_name', Value: firstName },
          { Name: 'family_name', Value: lastName },
          { Name: 'email_verified', Value: 'true' },
        ],
        TemporaryPassword: randomPassword,
        MessageAction: 'SUPPRESS',
      }));
  
      // Step 2: Set permanent password
      await client.send(new AdminSetUserPasswordCommand({
        UserPoolId: process.env.COGNITO_USER_POOL_ID,
        Username: email,
        Password: randomPassword,
        Permanent: true,
      }));
  
      // Step 3: Authenticate to get tokens
      const authResponse = await client.send(new AdminInitiateAuthCommand({
        UserPoolId: process.env.COGNITO_USER_POOL_ID,
        ClientId: process.env.COGNITO_CLIENT_ID,
        AuthFlow: 'ADMIN_USER_PASSWORD_AUTH',
        AuthParameters: {
          USERNAME: email,
          PASSWORD: randomPassword,
        },
      }));
  
      // Step 4: Save user to database
      await putItem(TABLE_NAMES.USERS, {
        userId,
        email,
        firstName,
        lastName,
        createdAt: new Date().toISOString(),
        googleLinked: true,
      });
  
      return {
        statusCode: 200,
        body: JSON.stringify({
          userId,
          accessToken: authResponse.AuthenticationResult.AccessToken,
          idToken: authResponse.AuthenticationResult.IdToken,
          refreshToken: authResponse.AuthenticationResult.RefreshToken,
          message: 'Google sign-in successful'
        }),
      };
    } catch (error) {
      console.error('Google sign-in error', { error: error.message, stack: error.stack });
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Internal server error' }),
      };
    }
  };