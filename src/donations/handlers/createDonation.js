const { putItem, getItem } = require('../../utils/db');
const { TABLE_NAMES } = require('../../utils/constants');
const axios = require('axios');
const logger = require('../../utils/logger');
const { v4: uuidv4 } = require('uuid');

exports.handler = async (event) => {
  try {
    const { eventId, amount, userEmail } = JSON.parse(event.body || '{}');
    if (!eventId || !amount || !userEmail) {
      console.error('Missing required fields', { fields: { eventId, amount, userEmail } });
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing required fields' }),
      };
    }

    // Get event details
    const event = await getItem(TABLE_NAMES.EVENTS, { id: eventId });
    if (!event || !event.chipInDetails) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Event not found or not accepting chip-ins' })
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
    const chipInId = `CHIPIN_${uuidv4()}`;
    const paymentReference = uuidv4();

    const paymentResponse = await axios.post(
      'https://api.paystack.co/transaction/initialize',
      {
        email: userEmail,
        amount: parsedAmount * 100, // Convert to kobo
        reference: `CHIPIN_${uuidv4()}`,
        metadata: {
          eventId,
          chipInType: 'event',
          recipientCode: event.chipInDetails.recipientCode
        }
      },
      {
        headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` }
      }
    );

    await putItem(TABLE_NAMES.DONATIONS, {
      id: chipInId,
      eventId,
      userId: userId,
      userEmail: userEmail,
      amount: parsedAmount.toString(),
      status: 'pending',
      paymentReference: paymentResponse.data.data.reference,
      recipientCode: event.chipInDetails.recipientCode,
      createdAt: new Date().toISOString()
    });

    console.log('Donation initiated', { donationId, userId, eventId });
    return {
      statusCode: 200,
      body: JSON.stringify({
        donationId,
        paymentUrl: paystackResponse.data.data.authorization_url,
        message: 'Payment initiated',
      }),
    };
  } catch (error) {
    console.error('Create donation error', { error: error.message, stack: error.stack });
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Payment initialization failed' }),
    };
  }
};