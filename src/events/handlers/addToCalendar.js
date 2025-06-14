const { getItem } = require('../../utils/db');
const { TABLE_NAMES, API_KEYS } = require('../../utils/constants');
const { google } = require('googleapis');
const axios = require('axios');
const icalGenerator = require('ical-generator');
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
    const { responseType, previousResponse } = body;

    // Validate required fields
    if (!eventId) {
      console.error('Missing eventId');
      return {
        statusCode: 400,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type,Authorization",
          "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
        },  
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
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type,Authorization",
          "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
        },  
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Invalid user identity' }),
      };
    }

    const user = await getItem(TABLE_NAMES.USERS, { userId: { S: userId } });

    if (!user) {
      console.error('User not found', { userId });
      return {
        statusCode: 404,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type,Authorization",
          "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
        },  
        body: JSON.stringify({ error: 'User not found' }),
      };
    }

    const eventData = await getItem(TABLE_NAMES.EVENTS, { id: { S: eventId } });
    if (!eventData) {
      console.error('Event not found', { eventId });
      return {
        statusCode: 404,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type,Authorization",
          "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
        },  
        body: JSON.stringify({ error: 'Event not found' }),
      };
    }

    // Determine email subject and content based on response type
    const isUpdateFromMaybe = previousResponse === 'maybe' && responseType === 'yes';
    const subject = isUpdateFromMaybe 
      ? `You updated to "Going" for ${eventData.title.S}`
      : responseType === 'yes' 
        ? `You're confirmed for ${eventData.title.S}`
        : `You marked "Maybe" for ${eventData.title.S}`;

    const htmlContent = isUpdateFromMaybe
      ? `<p>You've updated your response from "Maybe" to "Going" for ${eventData.title.S}!</p>`
      : responseType === 'yes'
        ? `<p>You're confirmed for ${eventData.title.S}!</p>`
        : `<p>You marked yourself as "Maybe" for ${eventData.title.S}.</p>`;

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
          end: { dateTime: new Date(new Date(eventData.date.S).getTime() + 2 * 60 * 60 * 1000).toISOString() },
        },
      });
      console.log('Event added to Google Calendar', { userId, eventId });

      // Send confirmation email for Google Calendar users
      await axios.post(
        'https://api.resend.com/emails',
        {
          from: API_KEYS.RESEND_FROM_EMAIL,
          to: user.email.S,
          subject: subject,
          html: `
            ${htmlContent}
            <p>Event: ${eventData.title.S}</p>
            <p>Date: ${new Date(eventData.date.S).toLocaleString()}</p>
            <p>Location: ${eventData.location?.S || 'Not specified'}</p>
            <p>The event has been added to your Google Calendar.</p>
          `
        },
        {
          headers: { Authorization: `Bearer ${API_KEYS.RESEND_API_KEY}` },
        }
      );
    } else {
      // Google Calendar not linked, send ICS file via email
      const calendar = icalGenerator({
        name: 'Meetro Event',
        timezone: 'UTC'
      });
      
      calendar.createEvent({
        start: new Date(eventData.date.S),
        end: new Date(new Date(eventData.date.S).getTime() + 2 * 60 * 60 * 1000),
        summary: eventData.title.S,
        description: eventData.description.S + `\n\nEvent Link: https://meetro.live/event/${eventId}`,
        url: `https://meetro.live/event/${eventId}`,
        organizer: {
          name: 'Meetro',
          email: 'noreply@meetro.live'
        },
        method: 'REQUEST'
      });

      const icsContent = calendar.toString();
      
      await axios.post(
        'https://api.resend.com/emails',
        {
          from: API_KEYS.RESEND_FROM_EMAIL,
          to: user.email.S,
          subject: subject,
          html: `
            ${htmlContent}
            <p>Please find the event invitation attached.</p>
            <p>Event: ${eventData.title.S}</p>
            <p>Date: ${new Date(eventData.date.S).toLocaleString()}</p>
            <p>Location: ${eventData.location?.S || 'Not specified'}</p>
          `,
          attachments: [{
            filename: 'event.ics',
            content: Buffer.from(icsContent).toString('base64'),
            contentType: 'text/calendar; method=REQUEST; charset=UTF-8'
          }]
        },
        { headers: { Authorization: `Bearer ${API_KEYS.RESEND_API_KEY}` } }
      );
      console.log('ICS file sent to email', { userId, eventId, email: user.email.S });
    }

    console.log('Event added to calendar or emailed', { userId, eventId, responseType });
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
      },  
      body: JSON.stringify({ 
        message: 'Event added to calendar or emailed',
        responseType: responseType || 'yes' // Default to 'yes' for backward compatibility
      }),
    };
  } catch (error) {
    console.error('Add to calendar error', { error: error.message, stack: error.stack });
    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
      },  
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};