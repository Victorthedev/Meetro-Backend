const { getItem, queryItems } = require('../../utils/db');
const { TABLE_NAMES, API_KEYS } = require('../../utils/constants');
const axios = require('axios');
const { decode } = require('jsonwebtoken');

exports.handler = async (event) => {
  try {
    // Parse input with multiple fallbacks
    const body = typeof event.body === 'string' ? JSON.parse(event.body || '{}') : event.body || {};
    const { eventId, subject, message } = body;

    // Validate required fields
    if (!eventId || !subject || !message) {
      return {
        statusCode: 400,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type,Authorization",
          "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
        },
        body: JSON.stringify({ error: 'Missing required fields (eventId, subject, message)' }),
      };
    }

    // Multi-format JWT extraction
    let userId;
    const authContext = event.requestContext?.authorizer;

    if (authContext?.jwt?.claims?.sub) {
      userId = authContext.jwt.claims.sub;
    } else if (authContext?.claims?.sub) {
      userId = authContext.claims.sub;
    } else if (event.headers?.Authorization) {
      const token = event.headers.Authorization.split(' ')[1];
      const decoded = decode(token);
      userId = decoded?.sub;
    }

    if (userId && userId.startsWith('eyJ')) {
      const decoded = decode(userId);
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

    // Verify the user is the event creator
    const eventData = await getItem(TABLE_NAMES.EVENTS, { id: { S: eventId } });
    if (!eventData) {
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

    if (eventData.creatorId.S !== userId) {
      return {
        statusCode: 403,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type,Authorization",
          "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
        },
        body: JSON.stringify({ error: 'Only the event creator can send email blasts' }),
      };
    }

    // Get all shares for this event
    const shares = await queryItems(
      TABLE_NAMES.SHARES,
      '#eventId = :eventId',
      { '#eventId': 'eventId' },
      { ':eventId': { S: eventId } }
    );

    // Collect all unique attendees (both yes and maybe)
    const attendees = new Set();
    const creator = await getItem(TABLE_NAMES.USERS, { userId: { S: userId } });

    for (const share of shares) {
      if (share.attendees?.L) {
        for (const attendee of share.attendees.L) {
          if (attendee.M?.userId?.S) {
            attendees.add(attendee.M.userId.S);
          }
        }
      }
    }

    // Get email addresses for all attendees
    const emailRecipients = [];
    for (const attendeeId of attendees) {
      const user = await getItem(TABLE_NAMES.USERS, { userId: { S: attendeeId } });
      if (user?.email?.S) {
        emailRecipients.push(user.email.S);
      }
    }

    if (emailRecipients.length === 0) {
      return {
        statusCode: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type,Authorization",
          "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
        },
        body: JSON.stringify({ message: 'No attendees to email', recipients: 0 }),
      };
    }

    // Send email blast
    const emailResponse = await axios.post(
      'https://api.resend.com/emails',
      {
        from: `${creator.firstName?.S || 'Meetro'} <${API_KEYS.RESEND_FROM_EMAIL}>`,
        to: emailRecipients,
        subject: subject,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">${subject}</h2>
            <div style="background: #f9f9f9; padding: 20px; border-radius: 8px; margin: 20px 0;">
              ${message.replace(/\n/g, '<br>')}
            </div>
            <p style="font-size: 14px; color: #666;">
              This message is regarding the event: <strong>${eventData.title.S}</strong><br>
              Date: ${new Date(eventData.date.S).toLocaleString()}<br>
              Location: ${eventData.location?.S || 'Online'}
            </p>
            <p style="font-size: 14px; color: #666;">
              <a href="https://meetro.live/event/${eventId}" 
                 style="color: #0066cc; text-decoration: none;">
                View event details
              </a>
            </p>
          </div>
        `,
        text: `${subject}\n\n${message}\n\nEvent: ${eventData.title.S}\nDate: ${new Date(eventData.date.S).toLocaleString()}\nLocation: ${eventData.location?.S || 'Online'}\n\nView event: https://meetro.live/event/${eventId}`
      },
      {
        headers: { Authorization: `Bearer ${API_KEYS.RESEND_API_KEY}` },
      }
    );

    console.log('Email blast sent', {
      eventId,
      recipients: emailRecipients.length,
      resendId: emailResponse.data.id
    });

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
      },
      body: JSON.stringify({
        message: 'Email blast sent successfully',
        recipients: emailRecipients.length,
        resendId: emailResponse.data.id
      }),
    };
  } catch (error) {
    console.error('Email blast error', {
      error: error.message,
      stack: error.stack,
      response: error.response?.data
    });

    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
      },
      body: JSON.stringify({
        error: 'Failed to send email blast',
        details: error.response?.data || error.message
      }),
    };
  }
};