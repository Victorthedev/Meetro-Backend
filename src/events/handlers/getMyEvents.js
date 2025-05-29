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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Invalid user identity' }),
      };
    }

    const events = await queryItems(TABLE_NAMES.EVENTS, {
      IndexName: 'byCreator',
      KeyConditionExpression: 'creator = :creator',
      ExpressionAttributeValues: { ':creator': { S: userId } },
    });

    // Fetch user data for each event creator
    const enhancedEvents = await Promise.all(events.map(async (event) => {
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
        console.warn(`Failed to fetch user data for creator ${creatorId}`, { error: error.message });
      }
      
      return {
        ...event,
        creator: {
          id: { S: creatorId },
          firstName: creatorData.firstName,
          lastName: creatorData.lastName,
          email: creatorData.email
        }
      };
    }));

    console.log('My events retrieved', { userId, count: events.length });
    return {
      statusCode: 200,
      body: JSON.stringify(enhancedEvents),
    };
  } catch (error) {
    console.error('Get my events error', { error: error.message, stack: error.stack });
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};