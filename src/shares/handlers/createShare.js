const { putItem, getItem } = require('../../utils/db');
const { TABLE_NAMES } = require('../../utils/constants');
const { v4: uuidv4 } = require('uuid');
const { decode } = require('jsonwebtoken');
// Import DynamoDB dependencies for fallback
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');

exports.handler = async (event) => {
  try {
    // Parse input with multiple fallbacks
    const body = typeof event.body === 'string' ? JSON.parse(event.body || '{}') : event.body || {};
    const { eventId } = body; // Only need eventId now
    
    // Validate required field
    if (!eventId) {
      console.error('Missing required field: eventId');
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

    // Multi-format JWT extraction (unchanged)
    let userId, userName;
    const authContext = event.requestContext?.authorizer;
    
    // Case 1: Standard API Gateway with Cognito
    if (authContext?.jwt?.claims?.sub) {
      userId = authContext.jwt.claims.sub;
      userName = authContext.jwt.claims.given_name;
    } 
    // Case 2: Proxy integration format
    else if (authContext?.claims?.sub) {
      userId = authContext.claims.sub;
      userName = authContext.claims.given_name;
    }
    // Case 3: Fallback to Authorization header
    else if (event.headers?.Authorization) {
      const token = event.headers.Authorization.split(' ')[1];
      const decoded = decode(token);
      userId = decoded?.sub;
      userName = decoded?.given_name;
    }

    // Handle JWT-as-ID case
    if (userId && userId.startsWith('eyJ')) {
      const decoded = decode(userId);
      userId = decoded?.sub;
      userName = decoded?.given_name;
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

    if (!userName) {
      try {
        const user = await getItem(TABLE_NAMES.USERS, { userId: { S: userId } });
        userName = user?.firstName?.S || 'A friend';
      } catch (dbError) {
        console.error('Failed to fetch user name from DynamoDB', { error: dbError.message });
        userName = 'A friend';
      }
    }

    const shareId = uuidv4();
    const shareUrl = `https://www.meetro.live/event/${eventId}?ref=share_${shareId}`;
    
    try {
      await putItem(TABLE_NAMES.SHARES, {
        id: shareId,
        sharedBy: userId,
        eventId,
        shareUrl,
        attendees: [],
        createdAt: new Date().toISOString(),
      });
    } catch (putError) {
      if (putError.message.includes('PutCommand is not a constructor')) {
        const client = new DynamoDBClient({ region: process.env.AWS_REGION });
        const docClient = DynamoDBDocumentClient.from(client);
        await docClient.send(new PutCommand({
          TableName: TABLE_NAMES.SHARES,
          Item: {
            id: { S: shareId },
            sharedBy: { S: userId },
            eventId: { S: eventId },
            shareUrl: { S: shareUrl },
            attendees: { L: [] },
            createdAt: { S: new Date().toISOString() },
          },
        }));
      } else {
        throw putError;
      }
    }

    // Get event details to include in response
    const eventData = await getItem(TABLE_NAMES.EVENTS, { id: { S: eventId } });
    
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
      },  
      body: JSON.stringify({
        shareId,
        shareUrl,
        message: 'Event shared successfully',
        eventDetails: {
          title: eventData?.title?.S,
          description: eventData?.description?.S,
          date: eventData?.date?.S,
          imageUrl: eventData?.imageUrl?.S
        }
      }),
    };
  } catch (error) {
    console.error('Create share error', { error: error.message, stack: error.stack });
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