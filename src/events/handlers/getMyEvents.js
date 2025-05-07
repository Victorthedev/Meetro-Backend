const { queryItems } = require('../../utils/db');
const { TABLE_NAMES } = require('../../utils/constants');
const logger = require('../../utils/logger');

exports.handler = async (event) => {
  try {
    const userId = event.requestContext.authorizer.jwt.claims.sub;

    const events = await queryItems(TABLE_NAMES.EVENTS, {
      IndexName: 'byCreator',
      KeyConditionExpression: 'creator = :creator',
      ExpressionAttributeValues: { ':creator': userId },
    });

    logger.info('My events retrieved', { userId, count: events.length });
    return {
      statusCode: 200,
      body: JSON.stringify(events),
    };
  } catch (error) {
    logger.error('Get my events error', { error: error.message, stack: error.stack });
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};