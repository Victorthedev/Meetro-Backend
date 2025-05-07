const { getItem, updateItem } = require('../../utils/db');
const { TABLE_NAMES } = require('../../utils/constants');
const { google } = require('googleapis');
const logger = require('../../utils/logger');
const { v4: uuidv4 } = require('uuid');

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET, // Add to env vars
  'postmessage'
);

exports.handler = async (event) => {
  try {
    const { code } = JSON.parse(event.body || '{}');
    if (!code) {
      logger.error('Missing authorization code');
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing authorization code' }),
      };
    }

    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const userId = event.requestContext.authorizer.jwt.claims.sub;
    const user = await getItem(TABLE_NAMES.USERS, { userId: { S: userId } });

    if (!user) {
      logger.error('User not found', { userId });
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'User not found' }),
      };
    }

    await updateItem(TABLE_NAMES.USERS, { userId: { S: userId } }, 'SET googleCalendarTokens = :tokens', {
      ':tokens': { S: JSON.stringify(tokens) },
    });

    logger.info('Google Calendar linked', { userId });
    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Google Calendar linked successfully' }),
    };
  } catch (error) {
    logger.error('Link Google Calendar error', { error: error.message, stack: error.stack });
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};