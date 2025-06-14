const { scanItems } = require('../../utils/db');
const { TABLE_NAMES } = require('../../utils/constants');
const logger = require('../../utils/logger');

exports.handler = async (event) => {
  try {
    const userId = event.requestContext.authorizer.jwt.claims.sub;
    const events = await scanItems(TABLE_NAMES.EVENTS, {
      FilterExpression: 'creator = :userId',
      ExpressionAttributeValues: { ':userId': { S: userId } },
    });

    logger.info('Events retrieved', { userId, count: events.length });
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
      },  
      body: JSON.stringify(events),
    };
  } catch (error) {
    logger.error('Get events error', { error: error.message, stack: error.stack });
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