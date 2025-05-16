const { getItem } = require('../../utils/db');
const { TABLE_NAMES, API_KEYS } = require('../../utils/constants');
const { google } = require('googleapis');
const logger = require('../../utils/logger');
const axios = require('axios');
const ical = require('ical-generator');
const { decode } = require('jsonwebtoken');

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'postmessage'
);

exports.handler = async (event) => {
  try {
    // Parse input with multiple fallbacks
    const body = typeof event.body === 'string' ? JSON.parse(event.body || '{}') : event.body || {};
    const { eventId } = event.pathParameters || {};

    // Validate required fields
    if (!eventId) {
      console.error('Missing eventId');
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing eventId' }),
      };
    }

    // Multi-format JWT extraction
    let userId;
    const authContext = event.requestContext?.authorizer;

    // Case 1: Standard API Gateway with Cognito
    if (authContext?.jwt?.claims?.sub) {
      userId = authContext.jwt.claims.sub;
    }
    // Case 2: Proxy integration format
    else if (authContext?.claims?.sub) {
      userId = authContext.claims.sub;
    }
    // Case 3: Fallback to Authorization header
    else if (event.headers?.Authorization) {
      const token = event.headers.Authorization.split(' ')[1];
      const decoded = decode(token);
      userId = decoded?.sub;
    }

    // Handle JWT-as-ID case
    if (userId && userId.startsWith('eyJ')) {
      const decoded = decode(userId);
      userId = decoded?.sub;
    }

    if (!userId) {
      console.error('Missing user ID in event:', JSON.stringify(event, null, 2));
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Invalid user identity' }),
      };
    }

    const user = await getItem(TABLE_NAMES.USERS, { userId: { S: userId } });

    if (!user) {
      console.error('User not found', { userId });
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'User not found' }),
      };
    }

    const eventData = await getItem(TABLE_NAMES.EVENTS, { id: { S: eventId } });
    if (!eventData) {
      console.error('Event not found', { eventId });
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
      console.log('Event added to Google Calendar', { userId, eventId });
    } else {
      // Google Calendar not linked, send ICS file via email
      const calendar = ical({ name: 'Meetro Event' });
      calendar.createEvent({
        start: new Date(eventData.date.S),
        end: new Date(new Date(eventData.date.S).getTime() + 2 * 60 * 60 * 1000),
        summary: eventData.title.S,
        description: eventData.description.S,
        url: `https://meetro.live/events/${eventId}`,
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
      console.log('ICS file sent to email', { userId, eventId, email: user.email.S });
    }

    console.log('Event added to calendar or emailed', { userId, eventId });
    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Event added to calendar or emailed' }),
    };
  } catch (error) {
    console.error('Add to calendar error', { error: error.message, stack: error.stack });
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};