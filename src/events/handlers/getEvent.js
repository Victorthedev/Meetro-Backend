const { getItem } = require('../../utils/db');
const { TABLE_NAMES } = require('../../utils/constants');
const logger = require('../../utils/logger');

exports.handler = async (event) => {
  try {
    const { eventId } = event.pathParameters || {};
    if (!eventId) {
      logger.error('Missing eventId');
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing eventId' }),
      };
    }

    const event = await getItem(TABLE_NAMES.EVENTS, { id: { S: eventId } });
    if (!event) {
      logger.error('Event not found', { eventId });
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Event not found' }),
      };
    }

    logger.info('Event retrieved', { eventId });
    return {
      statusCode: 200,
      body: JSON.stringify(event),
    };
  } catch (error) {
    logger.error('Get event error', { error: error.message, stack: error.stack });
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};