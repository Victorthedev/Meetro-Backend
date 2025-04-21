const { CognitoIdentityProviderClient, SignUpCommand, InitiateAuthCommand } = require('@aws-sdk/client-cognito-identity-provider');
const { OAuth2Client } = require('google-auth-library');
const dynamodb = new AWS.DynamoDB.DocumentClient();
const calendarService = require('../../services/calendarService');
const { NIGERIAN_STATES } = require('../../utils/constants');

const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

exports.handler = async (event) => {
  try {
    const { token, state } = JSON.parse(event.body);
    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID
    });
    const { email, name, picture, sub: googleId } = ticket.getPayload();

    if (state && !NIGERIAN_STATES.includes(state)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid Nigerian state' })
      };
    }

    try {
      await cognitoClient.send(new SignUpCommand({
        ClientId: process.env.COGNITO_CLIENT_ID,
        Username: email,
        Password: googleId + process.env.COGNITO_GOOGLE_SECRET,
        UserAttributes: [
          { Name: 'email', Value: email },
          { Name: 'name', Value: name }
        ]
      }));
    } catch (error) {
      if (error.name !== 'UsernameExistsException') throw error;
    }

    let user = await dynamodb.get({
      TableName: process.env.USERS_TABLE,
      Key: { email }
    }).promise();

    if (!user.Item) {
      user = {
        id: email,
        email,
        name,
        googleId,
        profilePicture: picture,
        state: state || '',
        authProvider: 'google',
        calendarType: 'google',
        googleCalendarToken: token,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await dynamodb.put({
        TableName: process.env.USERS_TABLE,
        Item: user
      }).promise();

      await calendarService.syncGoogleCalendar(user, token);
    }

    const { AuthenticationResult } = await cognitoClient.send(new InitiateAuthCommand({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: process.env.COGNITO_CLIENT_ID,
      AuthParameters: {
        USERNAME: email,
        PASSWORD: googleId + process.env.COGNITO_GOOGLE_SECRET
      }
    }));

    return {
      statusCode: 200,
      body: JSON.stringify({
        token: AuthenticationResult.IdToken,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          state: user.state,
          profilePicture: user.profilePicture,
          calendarType: user.calendarType
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