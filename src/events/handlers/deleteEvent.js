const { getItem, deleteItem } = require('../../utils/db');
const { TABLE_NAMES } = require('../../utils/constants');

exports.handler = async (event) => {
  try {
    const eventId = event.pathParameters.eventId;
    
    if (!eventId) {
      console.error('Missing eventId', { eventId });
      return {
        statusCode: 400,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type,Authorization",
          "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
        },
        body: JSON.stringify({ error: 'Missing eventId' })
      };
    }

    const userId = event.requestContext?.authorizer?.jwt?.claims?.sub || event.requestContext?.authorizer?.claims?.sub;
    
    if (!userId) {
      console.error('Missing user ID in event:', event);
      return {
        statusCode: 401,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type,Authorization",
          "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
        },
        body: JSON.stringify({ error: 'Unauthorized' })
      };
    }

    // Get the existing event to verify ownership
    const existingEvent = await getItem(TABLE_NAMES.EVENTS, { id: eventId });
    
    if (!existingEvent) {
      console.error('Event not found', { eventId });
      return {
        statusCode: 404,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type,Authorization",
          "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
        },
        body: JSON.stringify({ error: 'Event not found' })
      };
    }

    // Verify that the user is the creator of the event
    if (existingEvent.creator !== userId) {
      console.error('Unauthorized delete attempt', { userId, eventId, creator: existingEvent.creator });
      return {
        statusCode: 403,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type,Authorization",
          "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
        },
        body: JSON.stringify({ error: 'Unauthorized' })
      };
    }

    // Delete the event
    await deleteItem(TABLE_NAMES.EVENTS, { id: eventId });

    console.log('Event deleted successfully', { userId, eventId });
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
      },
      body: JSON.stringify({ 
        message: 'Event deleted successfully',
        eventId 
      })
    };

  } catch (error) {
    console.error('Delete event failed', error);
    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
      },
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};