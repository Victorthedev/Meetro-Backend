const { putItem, getItem } = require('../../utils/db');
const { TABLE_NAMES } = require('../../utils/constants');
const axios = require('axios');
const logger = require('../../utils/logger');
const { v4: uuidv4 } = require('uuid');

exports.handler = async (event) => {
  try {
    const { ticketId, quantity } = JSON.parse(event.body || '{}');
    if (!ticketId || !quantity) {
      logger.error('Missing required fields', { fields: { ticketId, quantity } });
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing required fields' }),
      };
    }

    const userId = event.requestContext.authorizer.jwt.claims.sub;
    const ticket = await getItem(TABLE_NAMES.TICKETS, { id: { S: ticketId } });

    if (!ticket || ticket.quantity.N < quantity) {
      logger.error('Ticket not found or insufficient quantity', { ticketId, quantity });
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Ticket not available' }),
      };
    }

    const user = await getItem(TABLE_NAMES.USERS, { userId: { S: userId } });
    if (!user || !user.email) {
      logger.error('User email not found', { userId });
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'User email not found' }),
      };
    }

    const purchaseId = uuidv4();
    const amount = parseFloat(ticket.price.N) * quantity;
    const paymentReference = uuidv4();

    // Initiate Paystack payment
    const paystackResponse = await axios.post(
      'https://api.paystack.co/transaction/initialize',
      {
        email: user.email.S, // Use user's actual email
        amount: amount * 100, // Paystack uses kobo (multiply by 100)
        reference: paymentReference,
      },
      {
        headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
      }
    );

    await putItem(TABLE_NAMES.PURCHASES, {
      id: purchaseId,
      userId,
      ticketId,
      eventId: ticket.eventId.S,
      amount: amount.toString(),
      quantity: quantity.toString(),
      paymentReference,
      status: 'pending',
      createdAt: new Date().toISOString(),
    });

    logger.info('Ticket purchase initiated', { purchaseId, userId, ticketId });
    return {
      statusCode: 200,
      body: JSON.stringify({
        purchaseId,
        paymentUrl: paystackResponse.data.data.authorization_url,
        message: 'Payment initiated',
      }),
    };
  } catch (error) {
    logger.error('Purchase ticket error', { error: error.message, stack: error.stack });
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};