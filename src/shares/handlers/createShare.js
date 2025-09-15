const { putItem, getItem } = require('../../utils/db');
const { TABLE_NAMES } = require('../../utils/constants');
const { v4: uuidv4 } = require('uuid');
const { decode } = require('jsonwebtoken');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');

exports.handler = async (event) => {
  try {
    let body;
    try {
      body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body || {};
    } catch (parseError) {
      return {
        statusCode: 400,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type,Authorization",
          "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
        },
        body: JSON.stringify({ error: 'Invalid JSON format in request body' }),
      };
    }

    const { eventId } = body;
    
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

    let userId, userName;
    const authContext = event.requestContext?.authorizer;
    
    if (authContext?.jwt?.claims?.sub) {
      userId = authContext.jwt.claims.sub;
      userName = authContext.jwt.claims.given_name;
    } 
    else if (authContext?.claims?.sub) {
      userId = authContext.claims.sub;
      userName = authContext.claims.given_name;
    }
    else if (event.headers?.Authorization) {
      const token = event.headers.Authorization.split(' ')[1];
      const decoded = decode(token);
      userId = decoded?.sub;
      userName = decoded?.given_name;
    }

    if (userId && userId.startsWith('eyJ')) {
      const decoded = decode(userId);
      userId = decoded?.sub;
      userName = decoded?.given_name;
    }

    if (userId && !userName) {
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
        sharedBy: userId || 'anonymous',
        eventId,
        shareUrl,
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
            sharedBy: { S: userId || 'anonymous' },
            eventId: { S: eventId },
            shareUrl: { S: shareUrl },
            createdAt: { S: new Date().toISOString() },
          },
        }));
      } else {
        throw putError;
      }
    }

    const eventData = await getItem(TABLE_NAMES.EVENTS, { id: eventId });
    
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
          title: eventData?.title?.S || eventData?.title,
          description: eventData?.description?.S || eventData?.description,
          date: eventData?.date?.S || eventData?.date,
          imageUrl: eventData?.imageUrl?.S || eventData?.imageUrl
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