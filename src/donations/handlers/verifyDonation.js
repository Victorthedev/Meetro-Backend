const { getItem, updateItem } = require('../../utils/db');
const { TABLE_NAMES } = require('../../utils/constants');
const axios = require('axios');
const logger = require('../../utils/logger');

exports.handler = async (event) => {
  try {
    const { reference } = event.queryStringParameters || {};
    if (!reference) {
      logger.error('Missing reference');
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing reference' }),
      };
    }

    const donation = await getItem(TABLE_NAMES.DONATIONS, { paymentReference: { S: reference } });
    if (!donation) {
      logger.error('Donation not found', { reference });
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Donation not found' }),
      };
    }

    const paystackResponse = await axios.get(`https://api.paystack.co/transaction/verify/${reference}`, {
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
    });

    if (paystackResponse.data.data.status === 'success') {
      await updateItem(TABLE_NAMES.DONATIONS, { id: { S: donation.id.S } }, 'SET status = :status', {
        ':status': { S: 'completed' },
      });

      logger.info('Donation verified', { reference, donationId: donation.id.S });
      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'Donation verified', donation }),
      };
    }

    logger.error('Donation verification failed', { reference });
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Donation verification failed' }),
    };
  } catch (error) {
    logger.error('Verify donation error', { error: error.message, stack: error.stack });
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};