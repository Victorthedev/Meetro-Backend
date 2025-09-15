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

    // 1. Find all shares where this user is an attendee with a response
    const shares = await queryItems(TABLE_NAMES.SHARES, {
      IndexName: 'byAttendeeUserId-index',
      KeyConditionExpression: 'attendeeUserId = :userId',
      FilterExpression: 'attribute_exists(responseType) AND (responseType = :yes OR responseType = :maybe)',
      ExpressionAttributeValues: {
        ':userId': userId,
        ':yes': 'yes',
        ':maybe': 'maybe'
      }
    });

    // 2. Get full event details for each share
    const attendedEvents = await Promise.all(
      shares.map(async (share) => {
        try {
          const eventId = share.eventId?.S || share.eventId;
          const event = await getItem(TABLE_NAMES.EVENTS, { id: eventId });
          if (!event) return null;

          // Get creator details
          let creator = { firstName: 'Unknown', lastName: '', email: '' };
          try {
            const creatorId = event.creator?.S || event.creator;
            if (creatorId) {
              const creatorData = await getItem(TABLE_NAMES.USERS, { 
                userId: creatorId 
              });
              if (creatorData) {
                creator = {
                  firstName: creatorData.firstName?.S || 'Unknown',
                  lastName: creatorData.lastName?.S || '',
                  email: creatorData.email?.S || ''
                };
              }
            }
          } catch (error) {
            console.error('Error fetching creator data:', error);
          }

          // Extract response details from the share record
          const responseType = share.responseType?.S || share.responseType;
          const respondedAt = share.respondedAt?.S || share.respondedAt;
          const shareId = share.id?.S || share.id;

          return {
            id: event.id?.S || event.id,
            title: event.title?.S || event.title,
            description: event.description?.S || event.description,
            date: event.date?.S || event.date,
            location: event.location?.M || event.location, 
            timeFrom: event.timeFrom?.S || event.timeFrom, 
            timeTo: event.timeTo?.S || event.timeTo,     
            imageUrl: event.imageUrl?.S || event.imageUrl,
            creator: {
              id: event.creator?.S || event.creator,
              name: `${creator.firstName} ${creator.lastName}`.trim(),
              email: creator.email
            },
            response: responseType,
            respondedAt: respondedAt,
            shareId: shareId,
            chipInAmount: share.chipInAmount?.N || share.chipInAmount || "0",
            paymentStatus: share.paymentStatus?.S || share.paymentStatus || "pending"
          };
        } catch (error) {
          console.error('Error processing share:', error);
          return null;
        }
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