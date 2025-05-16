const { getItem, updateItem } = require('../../utils/db');
const { TABLE_NAMES } = require('../../utils/constants');
const { google } = require('googleapis');
const { v4: uuidv4 } = require('uuid');

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'postmessage'
);

exports.handler = async (event) => {
  try {
    // Consistent body parsing (like previous examples)
    const body = typeof event.body === 'string' ? JSON.parse(event.body || '{}') : event.body || {};
    const { code } = body; // Now correctly extracted

    if (!code) {
      console.error('Missing authorization code');
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing authorization code' }),
      };
    }

    // Rest of your existing code...
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const userId = event.requestContext.authorizer.jwt.claims.sub;
    const user = await getItem(TABLE_NAMES.USERS, { userId: { S: userId } });

    if (!user) {
      console.error('User not found', { userId });
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'User not found' }),
      };
    }

    await updateItem(TABLE_NAMES.USERS, { userId: { S: userId } }, 'SET googleCalendarTokens = :tokens', {
      ':tokens': { S: JSON.stringify(tokens) },
    });

    console.log('Google Calendar linked', { userId });
    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Google Calendar linked successfully' }),
    };
  } catch (error) {
    console.error('Link Google Calendar error', { error: error.message, stack: error.stack });
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};