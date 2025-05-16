const { putItem, getItem } = require('../../utils/db');
const { TABLE_NAMES } = require('../../utils/constants');
const axios = require('axios');
const logger = require('../../utils/logger');
const { v4: uuidv4 } = require('uuid');

exports.handler = async (event) => {
  try {
    const { eventId, amount } = JSON.parse(event.body || '{}');
    if (!eventId || !amount) {
      logger.error('Missing required fields', { fields: { eventId, amount } });
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing required fields' }),
      };
    }

    // Get event details
    const event = await getItem(TABLE_NAMES.EVENTS, { id: eventId });
    if (!event) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Event not found' })
      };
    }

    // Validate chip-in amount if event has chip-in
    if (event.chipInAmount) {
      const parsedAmount = parseFloat(amount);
      
      if (event.chipInType === 'FIXED') {
        if (parsedAmount !== parseFloat(event.chipInSettings.fixedAmount)) {
          return {
            statusCode: 400,
            body: JSON.stringify({ 
              error: `This event requires exactly ₦${event.chipInSettings.fixedAmount}` 
            })
          };
        }
      }
      else if (event.chipInType === 'FLEXIBLE') {
        if (parsedAmount < parseFloat(event.chipInSettings.minAmount)) {
          return {
            statusCode: 400,
            body: JSON.stringify({ 
              error: `Minimum chip-in amount is ₦${event.chipInSettings.minAmount}` 
            })
          };
        }
      }
    }

    const userId = event.requestContext.authorizer.jwt.claims.sub;
    const donationId = uuidv4();
    const paymentReference = uuidv4();

    const paystackResponse = await axios.post(
      'https://api.paystack.co/transaction/initialize',
      {
        email: userId, // Placeholder; replace with actual email if needed
        amount: parseFloat(amount) * 100,
        reference: paymentReference,
      },
      {
        headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
      }
    );

    await putItem(TABLE_NAMES.DONATIONS, {
      id: donationId,
      userId,
      eventId,
      amount: amount.toString(),
      paymentReference,
      status: 'pending',
      createdAt: new Date().toISOString(),
    });

    logger.info('Donation initiated', { donationId, userId, eventId });
    return {
      statusCode: 200,
      body: JSON.stringify({
        donationId,
        paymentUrl: paystackResponse.data.data.authorization_url,
        message: 'Donation initiated',
      }),
    };
  } catch (error) {
    logger.error('Create donation error', { error: error.message, stack: error.stack });
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};