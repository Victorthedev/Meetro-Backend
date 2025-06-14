const { putItem } = require('../../utils/db');
const { TABLE_NAMES } = require('../../utils/constants');
const logger = require('../../utils/logger');
const { v4: uuidv4 } = require('uuid');

exports.handler = async (event) => {
  try {
    const { eventId, name, price, quantity } = JSON.parse(event.body || '{}');
    if (!eventId || !name || !price || !quantity) {
      logger.error('Missing required fields', { fields: { eventId, name, price, quantity } });
      return {
        statusCode: 400,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type,Authorization",
          "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
        },  
        body: JSON.stringify({ error: 'Missing required fields' }),
      };
    }

    const userId = event.requestContext.authorizer.jwt.claims.sub;
    const ticketId = uuidv4();

    await putItem(TABLE_NAMES.TICKETS, {
      id: ticketId,
      eventId,
      name,
      price: parseFloat(price),
      quantity: parseInt(quantity, 10),
      creator: userId,
      createdAt: new Date().toISOString(),
    });

    logger.info('Ticket created', { userId, ticketId, eventId });
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
      },  
      body: JSON.stringify({ ticketId, message: 'Ticket created successfully' }),
    };
  } catch (error) {
    logger.error('Create ticket error', { error: error.message, stack: error.stack });
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