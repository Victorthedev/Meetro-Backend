const { putItem } = require('../../utils/db');
const { TABLE_NAMES } = require('../../utils/constants');
const axios = require('axios');
const logger = require('../../utils/logger');
const { v4: uuidv4 } = require('uuid');

exports.handler = async (event) => {
  try {
    const { eventId, friendEmails, message } = JSON.parse(event.body || '{}');
    if (!eventId || !friendEmails || !Array.isArray(friendEmails) || !message) {
      logger.error('Missing required fields', { fields: { eventId, friendEmails, message } });
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing required fields' }),
      };
    }

    const userId = event.requestContext.authorizer.jwt.claims.sub;
    const shareId = uuidv4();

    await putItem(TABLE_NAMES.SHARES, {
      id: shareId,
      sharedBy: userId,
      eventId,
      friendEmails: friendEmails.map(email => ({ S: email })),
      message,
      createdAt: new Date().toISOString(),
    });

    // Send WhatsApp message via Twilio (requires TWILIO_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER in env vars)
    const twilioResponse = await axios.post(
      'https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_SID}/Messages.json',
      new URLSearchParams({
        From: process.env.TWILIO_PHONE_NUMBER,
        To: friendEmails[0], // Send to first friend for demo; enhance for all
        Body: `${message} Event ID: ${eventId}`,
      }),
      { auth: { username: process.env.TWILIO_SID, password: process.env.TWILIO_AUTH_TOKEN } }
    );

    logger.info('Share created and WhatsApp sent', { shareId, userId, eventId });
    return {
      statusCode: 200,
      body: JSON.stringify({ shareId, message: 'Event shared successfully' }),
    };
  } catch (error) {
    logger.error('Create share error', { error: error.message, stack: error.stack });
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};