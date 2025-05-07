const { putItem } = require('../../utils/db');
const { TABLE_NAMES, EVENT_CATEGORIES } = require('../../utils/constants');
const logger = require('../../utils/logger');
const { v4: uuidv4 } = require('uuid');

exports.handler = async (event) => {
  try {
    const { title, description, date, location, ticketTypes, isPrivate, chipInAmount, category = '', imageKey } = JSON.parse(event.body || '{}');
    if (!title || !date || !location || !location.state) {
      logger.error('Missing required fields', { fields: { title, date, location } });
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing required fields' }),
      };
    }

    if (category && !EVENT_CATEGORIES.includes(category)) {
      logger.error('Invalid event category', { category });
      return {
        statusCode: 400,
        body: JSON.stringify({ error: `Invalid category. Must be one of: ${EVENT_CATEGORIES.join(', ')}` }),
      };
    }

    if (imageKey && !imageKey.startsWith('events/')) {
      logger.error('Invalid imageKey format', { imageKey });
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid imageKey. Must start with "events/"' }),
      };
    }

    const userId = event.requestContext.authorizer.jwt.claims.sub;
    const baseUuid = uuidv4();
    const eventId = isPrivate ? `PRI_${baseUuid}` : `PUB_${baseUuid}`;
    const createdAt = new Date().toISOString();

    await putItem(TABLE_NAMES.EVENTS, {
      id: eventId,
      creator: userId,
      title,
      description: description || '',
      date,
      'location.state': location.state,
      location: {
        city: location.city || '',
        state: location.state,
        country: location.country || '',
      },
      ticketTypes: ticketTypes || [],
      isPrivate: !!isPrivate,
      chipInAmount: chipInAmount ? parseFloat(chipInAmount) : 0,
      category: category || undefined,
      imageKey: imageKey || undefined,
      createdAt,
    });

    logger.info('Event created', { userId, eventId });
    return {
      statusCode: 200,
      body: JSON.stringify({ eventId, message: 'Event created successfully' }),
    };
  } catch (error) {
    logger.error('Create event error', { error: error.message, stack: error.stack });
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};