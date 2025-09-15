const { getItem } = require('../../utils/db');
const { TABLE_NAMES, API_KEYS } = require('../../utils/constants');
const { google } = require('googleapis');
const axios = require('axios');
const ical = require('ical-generator').default; // Correct import for ES modules
const { decode } = require('jsonwebtoken');

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'postmessage'
);

exports.handler = async (event) => {
  try {
    // Parse input
    const body = typeof event.body === 'string' ? JSON.parse(event.body || '{}') : event.body || {};
    const { eventId } = event.pathParameters || {};
    const { responseType, previousResponse } = body;

    // Validate required fields
    if (!eventId) {
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

    // Extract user ID from auth context
    let userId;
    const authContext = event.requestContext?.authorizer;
    
    if (authContext?.jwt?.claims?.sub) {
      userId = authContext.jwt.claims.sub;
    }
    else if (authContext?.claims?.sub) {
      userId = authContext.claims.sub;
    }
    else if (event.headers?.Authorization) {
      const token = event.headers.Authorization.split(' ')[1];
      const decoded = decode(token);
      userId = decoded?.sub;
    }

    if (!userId) {
      return {
        statusCode: 401,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type,Authorization",
          "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
        },  
        body: JSON.stringify({ error: 'Invalid user identity' }),
      };
    }

    // Get user and event data
    const user = await getItem(TABLE_NAMES.USERS, { userId });
    if (!user || !user.email) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'User not found or missing email' }),
      };
    }

    const eventData = await getItem(TABLE_NAMES.EVENTS, { id: eventId });
    if (!eventData || !eventData.title || !eventData.date) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Event not found or missing required fields' }),
      };
    }

    // Prepare email content
    const isUpdateFromMaybe = previousResponse === 'maybe' && responseType === 'yes';
    const subject = isUpdateFromMaybe 
      ? `You updated to "Going" for ${eventData.title}`
      : responseType === 'yes' 
        ? `You're confirmed for ${eventData.title}`
        : `You marked "Maybe" for ${eventData.title}`;

    const htmlContent = isUpdateFromMaybe
      ? `<p>You've updated your response from "Maybe" to "Going" for ${eventData.title}!</p>`
      : responseType === 'yes'
        ? `<p>You're confirmed for ${eventData.title}!</p>`
        : `<p>You marked yourself as "Maybe" for ${eventData.title}.</p>`;

    // Create calendar event object
    const eventStart = new Date(eventData.date);
    const eventEnd = new Date(eventStart.getTime() + 2 * 60 * 60 * 1000); // 2 hours duration
    
    // Generate ICS file
    const calendar = ical({
      name: 'Meetro Event',
      timezone: 'UTC'
    });
    
    calendar.createEvent({
      start: eventStart,
      end: eventEnd,
      summary: eventData.title,
      description: `${eventData.description || ''}\n\nEvent Link: https://meetro.live/event/${eventId}`,
      url: `https://meetro.live/event/${eventId}`,
      organizer: {
        name: 'Meetro',
        email: 'connect@meetro.live'
      }
    });

    const icsContent = calendar.toString();

    // Add to Google Calendar if connected
    if (user.googleCalendarTokens) {
      try {
        oauth2Client.setCredentials(JSON.parse(user.googleCalendarTokens));
        const calendarAPI = google.calendar({ version: 'v3', auth: oauth2Client });
        
        await calendarAPI.events.insert({
          calendarId: 'primary',
          requestBody: {
            summary: eventData.title,
            description: eventData.description || '',
            start: { dateTime: eventStart.toISOString() },
            end: { dateTime: eventEnd.toISOString() },
            location: eventData.location || ''
          },
        });
        console.log('Event added to Google Calendar');
      } catch (googleError) {
        console.error('Google Calendar error:', googleError);
        // Continue with email fallback
      }
    }

    // Send confirmation email
    try {
      const emailResponse = await axios.post(
        'https://api.resend.com/emails',
        {
          from: 'Meetro <connect@meetro.live>',
          to: user.email,
          subject: subject,
          html: `
            <h2>${subject}</h2>
            ${htmlContent}
            <p><strong>Event Details:</strong></p>
            <p>Title: ${eventData.title}</p>
            <p>Date: ${eventStart.toLocaleString()}</p>
            <p>Location: ${eventData.location || 'Not specified'}</p>
            ${user.googleCalendarTokens ? '<p>The event has been added to your Google Calendar.</p>' : ''}
            <p>You can manage your RSVP at: https://meetro.live/event/${eventId}</p>
          `,
          attachments: [{
            filename: 'event.ics',
            content: Buffer.from(icsContent).toString('base64'),
            contentType: 'text/calendar; method=REQUEST'
          }]
        },
        { 
          headers: { 
            Authorization: `Bearer ${process.env.RESEND_API_KEY || API_KEYS.RESEND_API_KEY}`,
            'Content-Type': 'application/json'
          } 
        }
      );
      console.log('Email sent successfully');
    } catch (emailError) {
      console.error('Email sending failed:', emailError.response?.data || emailError.message);
      // Continue execution even if email fails
    }

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
      },
      body: JSON.stringify({ 
        message: 'Calendar event processed and confirmation sent',
        responseType: responseType || 'yes'
      }),
    };
  } catch (error) {
    console.error('Handler error:', error);
    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
      },
      body: JSON.stringify({ 
        error: 'Internal server error',
        details: error.message 
      }),
    };
  }
};