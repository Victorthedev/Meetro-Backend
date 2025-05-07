const { scanItems } = require('../../utils/db');
const { TABLE_NAMES } = require('../../utils/constants');
const logger = require('../../utils/logger');

exports.handler = async (event) => {
  try {
    const events = await scanItems(TABLE_NAMES.EVENTS, {
      FilterExpression: 'isPrivate = :false',
      ExpressionAttributeValues: { ':false': { BOOL: false } },
    });

    logger.info('Public events retrieved', { count: events.length });
    return {
      statusCode: 200,
      body: JSON.stringify(events),
    };
  } catch (error) {
    logger.error('Get public events error', { error: error.message, stack: error.stack });
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};