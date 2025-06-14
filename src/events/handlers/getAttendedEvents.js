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

    // 1. Find all shares where this user is an attendee
    const shares = await queryItems(
      TABLE_NAMES.SHARES,
      'contains(attendees, :userId)',
      {},
      { ':userId': { S: userId } }
    );

    // 2. Get full event details and response status
    const attendedEvents = await Promise.all(
      shares.map(async (share) => {
        const event = await getItem(TABLE_NAMES.EVENTS, { id: { S: share.eventId.S } });
        if (!event) return null;

        // Find the user's specific response
        const userResponse = share.attendees.L.find(
          attendee => attendee.M?.userId.S === userId
        );

        // Get creator details
        let creator = { firstName: 'Unknown', lastName: '', email: '' };
        try {
          const creatorData = await getItem(TABLE_NAMES.USERS, { 
            userId: { S: event.creator.S } 
          });
          if (creatorData) {
            creator = {
              firstName: creatorData.firstName?.S || 'Unknown',
              lastName: creatorData.lastName?.S || '',
              email: creatorData.email?.S || ''
            };
          }
        } catch (error) {
          console.error('Error fetching creator data:', error);
        }

        return {
          id: event.id.S,
          title: event.title.S,
          description: event.description?.S,
          date: event.date.S,
          location: event.location?.S,
          imageUrl: event.imageUrl?.S,
          creator: {
            id: event.creator.S,
            name: `${creator.firstName} ${creator.lastName}`.trim(),
            email: creator.email
          },
          response: userResponse?.M?.responseType.S || 'unknown',
          respondedAt: userResponse?.M?.respondedAt.S,
          shareId: share.id.S
        };
      })
    );

    // Filter out any null events (in case of data inconsistency)
    const validEvents = attendedEvents.filter(event => event !== null);

    console.log('Attended events retrieved', { 
      userId, 
      count: validEvents.length 
    });

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
      },  
      body: JSON.stringify({
        events: validEvents,
        total: validEvents.length
      }),
    };

  } catch (error) {
    console.error('Get attended events error:', { 
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
        error: 'Failed to fetch attended events',
        ...(process.env.NODE_ENV === 'development' && { details: error.message })
      }),
    };
  }
};