const { queryItems, getItem } = require('../../utils/db');
const { TABLE_NAMES } = require('../../utils/constants');
const { decode } = require('jsonwebtoken');

exports.handler = async (event) => {
  try {
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

    // Get all events created by this user
    const events = await queryItems(TABLE_NAMES.EVENTS, {
      IndexName: 'byCreator',
      KeyConditionExpression: 'creator = :creator',
      ExpressionAttributeValues: { ':creator': { S: userId } },
    });

    // Enhanced processing with attendee information
    const enhancedEvents = await Promise.all(events.map(async (event) => {
      // Get creator details
      const creatorId = event.creator.S;
      let creatorData = { firstName: { S: 'Unknown' }, lastName: { S: '' }, email: { S: '' } };
      
      try {
        const userData = await getItem(TABLE_NAMES.USERS, { userId: { S: creatorId } });
        if (userData) {
          creatorData = {
            firstName: userData.firstName || { S: 'Unknown' },
            lastName: userData.lastName || { S: '' },
            email: userData.email || { S: '' }
          };
        }
      } catch (error) {
        console.warn(`Failed to fetch user data for creator ${creatorId}`, error);
      }

      // Get all shares for this event
      const shares = await queryItems(
        TABLE_NAMES.SHARES,
        '#eventId = :eventId',
        { '#eventId': 'eventId' },
        { ':eventId': { S: event.id.S } }
      );

      // Aggregate all attendees with their responses
      const attendees = [];
      for (const share of shares) {
        if (share.attendees?.L) {
          for (const attendee of share.attendees.L) {
            try {
              const user = await getItem(TABLE_NAMES.USERS, { 
                userId: { S: attendee.M?.userId.S } 
              });
              
              if (user) {
                attendees.push({
                  userId: attendee.M.userId.S,
                  name: `${user.firstName?.S || ''} ${user.lastName?.S || ''}`.trim() || 'Guest',
                  email: user.email?.S,
                  response: attendee.M.responseType.S, // "yes" or "maybe"
                  respondedAt: attendee.M.respondedAt.S
                });
              }
            } catch (error) {
              console.warn(`Failed to process attendee ${attendee.M?.userId.S}`, error);
            }
          }
        }
      }

      return {
        id: event.id.S,
        title: event.title.S,
        description: event.description?.S,
        date: event.date.S,
        location: event.location?.M,
        timeFrom: event.timeFrom?.S, 
        timeTo: event.timeTo?.S,
        imageUrl: event.imageUrl?.S,
        creator: {
          id: creatorId,
          firstName: creatorData.firstName.S,
          lastName: creatorData.lastName.S,
          email: creatorData.email.S
        },
        attendees,
        attendeeCount: attendees.length
      };
    }));

    console.log('My events with attendees retrieved', { userId, count: events.length });
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
      },  
      body: JSON.stringify({
        events: enhancedEvents,
        totalEvents: enhancedEvents.length,
        totalAttendees: enhancedEvents.reduce((sum, event) => sum + event.attendeeCount, 0)
      }),
    };
  } catch (error) {
    console.error('Get my events with attendees error', { 
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
      body: JSON.stringify({ 
        error: 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      }),
    };
  }
};