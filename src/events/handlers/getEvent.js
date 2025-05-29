const { getItem } = require('../../utils/db');
const { TABLE_NAMES } = require('../../utils/constants');

exports.handler = async (event) => {
  try {
    const { eventId } = event.pathParameters || {};
    if (!eventId) {
      console.error('Missing eventId');
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing eventId' }),
      };
    }
    
    const eventData = await getItem(TABLE_NAMES.EVENTS, { id: { S: eventId } });
    if (!eventData) {
      console.error('Event not found', { eventId });
      return {
        statusCode: 404,
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
    
    console.log('Event retrieved', { eventId });
    return {
      statusCode: 200,
      body: JSON.stringify(eventData),
    };
  } catch (error) {
    console.error('Get event error', { error: error.message, stack: error.stack });
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};