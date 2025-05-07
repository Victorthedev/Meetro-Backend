const { getItem } = require('../../utils/db');
const { TABLE_NAMES, API_KEYS } = require('../../utils/constants');
const { google } = require('googleapis');
const logger = require('../../utils/logger');
const axios = require('axios');
const ical = require('ical-generator'); // Requires npm install ical-generator

const oauth2Client = new google.auth.OOAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'postmessage'
);

exports.handler = async (event) => {
  try {
    const { eventId } = event.pathParameters || {};
    if (!eventId) {
      logger.error('Missing eventId');
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing eventId' }),
      };
    }

    const userId = event.requestContext.authorizer.jwt.claims.sub;
    const user = await getItem(TABLE_NAMES.USERS, { userId: { S: userId } });

    if (!user) {
      logger.error('User not found', { userId });
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'User not found' }),
      };
    }

    const eventData = await getItem(TABLE_NAMES.EVENTS, { id: { S: eventId } });
    if (!eventData) {
      logger.error('Event not found', { eventId });
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Event not found' }),
      };
    }

    if (user.googleCalendarTokens) {
      // Google Calendar is linked
      oauth2Client.setCredentials(JSON.parse(user.googleCalendarTokens.S));
      const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

      await calendar.events.insert({
        calendarId: 'primary',
        requestBody: {
          summary: eventData.title.S,
          description: eventData.description.S,
          start: { dateTime: eventData.date.S },
          end: { dateTime: new Date(new Date(eventData.date.S).getTime() + 2 * 60 * 60 * 1000).toISOString() }, // 2-hour default
        },
      });
      logger.info('Event added to Google Calendar', { userId, eventId });
    } else {
      // Google Calendar not linked, send ICS file via email
      const calendar = ical({ name: 'Meetro Event' });
      calendar.addEvent({
        start: new Date(eventData.date.S),
        end: new Date(new Date(eventData.date.S).getTime() + 2 * 60 * 60 * 1000),
        summary: eventData.title.S,
        description: eventData.description.S,
        url: `https://meetro.live/events/${eventId}`, // Replace with actual domain
      });

      const icsContent = calendar.toString();
      await axios.post(
        'https://api.resend.com/emails',
        {
          from: API_KEYS.RESEND_FROM_EMAIL,
          to: user.email.S,
          subject: 'Your Event Invitation',
          text: 'Please find the event invitation attached as an ICS file.',
          attachments: [
            {
              filename: 'event.ics',
              content: Buffer.from(icsContent).toString('base64'),
              contentType: 'text/calendar',
            },
          ],
        },
        {
          headers: { Authorization: `Bearer ${API_KEYS.RESEND_API_KEY}` },
        }
      );
      logger.info('ICS file sent to email', { userId, eventId, email: user.email.S });
    }

    logger.info('Event added to calendar or emailed', { userId, eventId });
    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Event added to calendar or emailed' }),
    };
  } catch (error) {
    logger.error('Add to calendar error', { error: error.message, stack: error.stack });
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};