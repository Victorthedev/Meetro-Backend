const { getItem, queryItems } = require('../../utils/db');
const { TABLE_NAMES } = require('../../utils/constants');

exports.handler = async (event) => {
  try {
    const { eventId } = event.pathParameters || {};
    if (!eventId) {
      console.error('Missing eventId');
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
        
    const eventData = await getItem(TABLE_NAMES.EVENTS, { id: { S: eventId } });
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
        
    // If we have a creator ID, look up the user details
    if (eventData.creator && eventData.creator.S) {
      const userId = eventData.creator.S;
      const userData = await getItem(TABLE_NAMES.USERS, { userId: { S: userId } });
            
      if (userData) {
        // Construct full name from firstName and lastName
        const firstName = userData.firstName ? userData.firstName.S : "";
        const lastName = userData.lastName ? userData.lastName.S : "";
        const fullName = `${firstName} ${lastName}`.trim() || "Unknown";
                
        // Replace the creator ID with user details
        eventData.creator = {
          M: {
            id: { S: userId },
            name: { S: fullName },
            email: userData.email || { S: "Unknown" }
          }
        };
      }
    }

    // Get attendees from SHARES table using the byEventId-index
    let attendees = [];
    try {
      const shares = await queryItems(TABLE_NAMES.SHARES, {
        IndexName: 'byEventId-index',
        KeyConditionExpression: 'eventId = :eventId',
        FilterExpression: 'attribute_exists(attendeeUserId) AND attribute_exists(responseType)',
        ExpressionAttributeValues: {
          ':eventId': { S: eventId }
        }
      });

      // Process attendees and get user details
      for (const share of shares) {
        if (share.attendeeUserId && share.responseType) {
          const attendeeUserId = share.attendeeUserId.S || share.attendeeUserId;
          const responseType = share.responseType.S || share.responseType;
          
          // Get user details for each attendee
          const userData = await getItem(TABLE_NAMES.USERS, { userId: { S: attendeeUserId } });
          
          if (userData) {
            const firstName = userData.firstName ? userData.firstName.S : "";
            const lastName = userData.lastName ? userData.lastName.S : "";
            const fullName = `${firstName} ${lastName}`.trim() || "Unknown";
            
            attendees.push({
              M: {
                userId: { S: attendeeUserId },
                name: { S: fullName },
                email: userData.email || { S: "Unknown" },
                responseType: { S: responseType },
                respondedAt: share.respondedAt || { S: new Date().toISOString() },
                chipInAmount: share.chipInAmount || { N: "0" },
                paymentStatus: share.paymentStatus || { S: "pending" }
              }
            });
          }
        }
      }
    } catch (attendeeError) {
      console.error('Error fetching attendees', { error: attendeeError.message });
      // Continue without attendees if there's an error
    }

    // Add attendees to event data
    eventData.attendees = {
      L: attendees
    };
        
    console.log('Event retrieved with attendees', { eventId, attendeeCount: attendees.length });
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
      },  
      body: JSON.stringify(eventData),
    };
  } catch (error) {
    console.error('Get event error', { error: error.message, stack: error.stack });
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