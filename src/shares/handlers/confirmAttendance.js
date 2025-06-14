const { putItem, getItem, updateItem } = require('../../utils/db');
const { TABLE_NAMES } = require('../../utils/constants');
const calendarHandler = require('../../events/handlers/addToCalendar');
const { decode } = require('jsonwebtoken');
const axios = require('axios');

exports.handler = async (event) => {
  try {
    // Parse input with multiple fallbacks
    const body = typeof event.body === 'string' ? JSON.parse(event.body || '{}') : event.body || {};
    const { shareId } = event.pathParameters || {};
    const { responseType } = body; // 'yes' or 'maybe'
    
    // Validate required fields
    if (!shareId) {
      console.error('Missing shareId');
      return {
        statusCode: 400,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type,Authorization",
          "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
        },  
        body: JSON.stringify({ error: 'Missing shareId' }),
      };
    }

    if (!responseType || !['yes', 'maybe'].includes(responseType)) {
      return {
        statusCode: 400,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type,Authorization",
          "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
        },  
        body: JSON.stringify({ error: 'Invalid responseType. Use "yes" or "maybe".' }),
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
        body: JSON.stringify({ error: 'Invalid user identity' }),
      };
    }
    
    const share = await getItem(TABLE_NAMES.SHARES, { id: { S: shareId } });
    
    if (!share) {
      console.error('Share not found', { shareId, userId });
      return {
        statusCode: 403,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type,Authorization",
          "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
        },  
        body: JSON.stringify({ error: 'Share not found' }),
      };
    }
    
    // Fetch user's email from USERS table
    const user = await getItem(TABLE_NAMES.USERS, { userId: { S: userId } });
    if (!user || !user.email?.S) {
      console.error('User or user email not found', { userId });
      return {
        statusCode: 403,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type,Authorization",
          "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
        },  
        body: JSON.stringify({ error: 'User or email not found' }),
      };
    }
    
    // Check if user's email is in friendEmails (with proper validation)
    const userEmail = user.email.S.toLowerCase();
    
    // Validate friendEmails exists and is properly structured
    if (!share.friendEmails || !share.friendEmails.L || !Array.isArray(share.friendEmails.L)) {
      console.error('Invalid share structure: missing or invalid friendEmails', { 
        shareId, 
        userId,
        shareStructure: JSON.stringify(share)
      });
      return {
        statusCode: 403,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type,Authorization",
          "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
        },  
        body: JSON.stringify({ error: 'Invalid share structure' }),
      };
    }
    
    // Safely map friendEmails to lowercase strings
    const friendEmails = share.friendEmails.L
      .filter(email => (email && email.S) || (email && email.M && email.M.S && email.M.S.S))
      .map(email => email.S ? email.S.toLowerCase() : email.M.S.S.toLowerCase());
    
    if (!friendEmails.includes(userEmail)) {
      console.error('User not authorized for share', {
        shareId,
        userId,
        userEmail,
        friendEmails
      });
      return {
        statusCode: 403,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type,Authorization",
          "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
        },  
        body: JSON.stringify({ error: 'User email not in share invite list' }),
      };
    }
    
    // Validate eventId exists
    if (!share.eventId || !share.eventId.S) {
      console.error('Invalid share structure: missing eventId', { shareId });
      return {
        statusCode: 400,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type,Authorization",
          "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
        },  
        body: JSON.stringify({ error: 'Share missing eventId' }),
      };
    }

    // Get event details for email content
    const eventData = await getItem(TABLE_NAMES.EVENTS, { id: { S: share.eventId.S } });
    if (!eventData) {
      console.error('Event not found', { eventId: share.eventId.S });
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

    // Check if user already responded
    const existingAttendees = share.attendees?.L || [];
    const existingResponseIndex = existingAttendees.findIndex(attendee => 
      attendee.M?.userId.S === userId || attendee.M?.userId?.S === userId
    );

    // Remove previous response if exists (to prevent duplicates)
    if (existingResponseIndex >= 0) {
      await updateItem(
        TABLE_NAMES.SHARES,
        { id: { S: shareId } },
        `REMOVE attendees[${existingResponseIndex}]`
      );
    }

    // Add new response
    await updateItem(
      TABLE_NAMES.SHARES,
      { id: { S: shareId } },
      'SET attendees = list_append(if_not_exists(attendees, :empty), :newAttendee)',
      {
        ':newAttendee': {
          L: [{
            M: {
              userId: { S: userId },
              responseType: { S: responseType },
              respondedAt: { S: new Date().toISOString() }
            }
          }]
        },
        ':empty': { L: [] }
      }
    );

    // Handle email notifications based on response type
    try {
      const eventLink = share.shareUrl?.S || `https://www.meetro.live/event/${share.eventId.S}`;
      
      if (responseType === 'yes') {
        // For "yes" responses, use calendar handler and send confirmation email
        await calendarHandler.handler({
          pathParameters: { eventId: share.eventId.S },
          requestContext: {
            authorizer: {
              claims: { sub: userId }
            }
          },
          body: JSON.stringify({
            responseType: 'yes',
            previousResponse: existingResponseIndex >= 0 ? 
              existingAttendees[existingResponseIndex].M?.responseType?.S : null
          })
        });
      } else {
        // For "maybe" responses, send specific email
        await axios.post('https://api.resend.com/emails', {
          from: 'Meetro <conneect@meetro.live>',
          to: user.email.S,
          subject: `You marked "Maybe" for ${eventData.title?.S || 'the event'}`,
          html: `
            <h2>You're considering attending</h2>
            <p>You marked yourself as "Maybe" for <strong>${eventData.title?.S || 'the event'}</strong>.</p>
            <p>You can update your response to "Going" anytime by visiting the event page.</p>
            <p><a href="${eventLink}">View Event Details</a></p>
            <p>Location: ${eventData.location?.S || 'Not specified'}</p>
            <p>Date: ${new Date(eventData.date?.S).toLocaleString()}</p>
          `,
          text: `You marked "Maybe" for ${eventData.title?.S || 'the event'}.\n\n` +
                `You can update to "Going" anytime: ${eventLink}\n\n` +
                `Location: ${eventData.location?.S || 'Not specified'}\n` +
                `Date: ${new Date(eventData.date?.S).toLocaleString()}`
        }, {
          headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` }
        });
      }
    } catch (emailError) {
      console.error('Failed to send email notification', {
        error: emailError.message,
        stack: emailError.stack
      });
      // Continue execution even if email fails
    }
    
    console.log('Attendance response recorded', { 
      userId, 
      shareId,
      responseType 
    });
    
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
      },  
      body: JSON.stringify({ 
        message: `Response recorded: ${responseType}`,
        canUpdate: responseType === 'maybe',
        eventDetails: {
          title: eventData.title?.S,
          date: eventData.date?.S,
          location: eventData.location?.S,
          imageUrl: eventData.imageUrl?.S
        }
      }),
    };
  } catch (error) {
    console.error('Confirm attendance error', { 
      error: error.message, 
      stack: error.stack 
    });
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