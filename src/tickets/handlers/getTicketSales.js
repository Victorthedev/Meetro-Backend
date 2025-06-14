const { queryItems } = require('../../utils/db');
const { TABLE_NAMES } = require('../../utils/constants');
const logger = require('../../utils/logger');

exports.handler = async (event) => {
  try {
    const { eventId } = event.pathParameters || {};
    if (!eventId) {
      logger.error('Missing eventId');
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

    const userId = event.requestContext.authorizer.jwt.claims.sub;
    const event = await queryItems(TABLE_NAMES.EVENTS, {
      KeyConditionExpression: 'id = :eventId',
      ExpressionAttributeValues: { ':eventId': eventId },
    })[0];

    if (!event || event.creator !== userId) {
      logger.error('Event not found or unauthorized', { eventId, userId });
      return {
        statusCode: 403,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type,Authorization",
          "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
        },  
        body: JSON.stringify({ error: 'Event not found or unauthorized' }),
      };
    }

    const purchases = await queryItems(TABLE_NAMES.PURCHASES, {
      IndexName: 'byEventId',
      KeyConditionExpression: 'eventId = :eventId AND status = :completed',
      ExpressionAttributeValues: {
        ':eventId': eventId,
        ':completed': 'completed',
      },
    });

    const totalRevenue = purchases.reduce((sum, purchase) => sum + parseFloat(purchase.amount), 0);

    logger.info('Ticket sales retrieved', { eventId, count: purchases.length, totalRevenue });
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
      },  
      body: JSON.stringify({ purchases, totalRevenue }),
    };
  } catch (error) {
    logger.error('Get ticket sales error', { error: error.message, stack: error.stack });
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