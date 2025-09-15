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
    
    // Get share using low-level format key
    const share = await getItem(TABLE_NAMES.SHARES, { id: shareId });
    
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
    
    // Fetch user's email from USERS table for email notifications
    const user = await getItem(TABLE_NAMES.USERS, { userId: userId });
    if (!user || !user.email) {
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
    
    // Validate eventId exists - handle both low-level and document client format
    const eventId = share.eventId?.S || share.eventId;
    if (!eventId) {
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
    const eventData = await getItem(TABLE_NAMES.EVENTS, { id: eventId });
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

    // Check if user already responded - handle both low-level and document client format
    const existingAttendees = share.attendees?.L || share.attendees || [];
    const existingResponseIndex = existingAttendees.findIndex(attendee => {
      // Handle multiple possible formats
      const attendeeUserId = attendee.M?.userId?.S || attendee.M?.userId || attendee.userId?.S || attendee.userId;
      return attendeeUserId === userId;
    });

    // Check if user has already confirmed "yes"
    const hasConfirmedYes = existingAttendees.some(attendee => {
      const attendeeUserId = attendee.M?.userId?.S || attendee.M?.userId || attendee.userId?.S || attendee.userId;
      const existingResponseType = attendee.M?.responseType?.S || attendee.M?.responseType || attendee.responseType?.S || attendee.responseType;
      return attendeeUserId === userId && existingResponseType === 'yes';
    });
    
    if (hasConfirmedYes && responseType === 'yes') {
      return {
        statusCode: 400,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type,Authorization",
          "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
        },  
        body: JSON.stringify({ error: 'You have already confirmed attendance' }),
      };
    }

    // Remove previous response if exists (to prevent duplicates)
    if (existingResponseIndex >= 0) {
      await updateItem(
        TABLE_NAMES.SHARES,
        { id: shareId },
        `REMOVE attendees[${existingResponseIndex}]`
      );
    }

    // Add new response - maintain consistency with existing data format
    await updateItem(
      TABLE_NAMES.SHARES,
      { id: shareId },
      'SET attendees = list_append(if_not_exists(attendees, :empty), :newAttendee)',
      {
        ':newAttendee': [{
          userId: userId,
          responseType: responseType,
          respondedAt: new Date().toISOString()
        }],
        ':empty': []
      }
    );

    // Handle email notifications based on response type
    try {
      const eventLink = share.shareUrl?.S || share.shareUrl || `https://www.meetro.live/event/${eventId}`;
      const userEmail = user.email?.S || user.email;
      const eventTitle = eventData.title?.S || eventData.title || 'the event';
      const eventLocation = eventData.location?.S || eventData.location || 'Not specified';
      const eventDate = eventData.date?.S || eventData.date;
      
      if (responseType === 'yes') {
        // For "yes" responses, use calendar handler and send confirmation email
        await calendarHandler.handler({
          pathParameters: { eventId: eventId },
          requestContext: {
            authorizer: {
              claims: { sub: userId }
            }
          },
          body: JSON.stringify({
            responseType: 'yes',
            previousResponse: existingResponseIndex >= 0 ? 
              (existingAttendees[existingResponseIndex].M?.responseType?.S || 
               existingAttendees[existingResponseIndex].M?.responseType ||
               existingAttendees[existingResponseIndex].responseType?.S ||
               existingAttendees[existingResponseIndex].responseType) : null
          })
        });
      } else {
        // For "maybe" responses, send specific email
        await axios.post('https://api.resend.com/emails', {
          from: 'Meetro <conneect@meetro.live>',
          to: userEmail,
          subject: `You marked "Maybe" for ${eventTitle}`,
          html: `
            <h2>You're considering attending</h2>
            <p>You marked yourself as "Maybe" for <strong>${eventTitle}</strong>.</p>
            <p>You can update your response to "Going" anytime by visiting the event page.</p>
            <p><a href="${eventLink}">View Event Details</a></p>
            <p>Location: ${eventLocation}</p>
            <p>Date: ${new Date(eventDate).toLocaleString()}</p>
          `,
          text: `You marked "Maybe" for ${eventTitle}.\n\n` +
                `You can update to "Going" anytime: ${eventLink}\n\n` +
                `Location: ${eventLocation}\n` +
                `Date: ${new Date(eventDate).toLocaleString()}`
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
    
    // Extract values for response, handling both formats
    const eventTitle = eventData.title?.S || eventData.title;
    const eventDate = eventData.date?.S || eventData.date;
    const eventLocation = eventData.location?.S || eventData.location;
    const eventImageUrl = eventData.imageUrl?.S || eventData.imageUrl;
    
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
          title: eventTitle,
          date: eventDate,
          location: eventLocation,
          imageUrl: eventImageUrl
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