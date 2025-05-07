const { scanItems, updateItem } = require('../../utils/db');
const { TABLE_NAMES, API_KEYS } = require('../../utils/constants');
const axios = require('axios');
const logger = require('../../utils/logger');

exports.handler = async (event) => {
  try {
    const events = await scanItems(TABLE_NAMES.EVENTS, {
      FilterExpression: 'date < :today AND attribute_not_exists(fundsDisbursed)',
      ExpressionAttributeValues: { ':today': { S: new Date().toISOString() } },
    });

    for (const event of events) {
      const eventId = event.id.S;
      const purchases = await scanItems(TABLE_NAMES.PURCHASES, {
        FilterExpression: 'eventId = :eventId AND status = :completed',
        ExpressionAttributeValues: {
          ':eventId': { S: eventId },
          ':completed': { S: 'completed' },
        },
      });

      const totalAmount = purchases.reduce((sum, purchase) => sum + parseFloat(purchase.amount.N), 0);
      if (totalAmount > 0) {
        // Retrieve creator's bank details (assumed stored in USERS table or a separate table)
        const creator = await scanItems(TABLE_NAMES.USERS, {
          FilterExpression: 'userId = :creator',
          ExpressionAttributeValues: { ':creator': { S: event.creator.S } },
        })[0];

        if (!creator || !creator.bankAccount) {
          logger.warn('No bank account found for creator', { eventId, creator: event.creator.S });
          continue; // Skip disbursement if no bank details
        }

        // Disburse funds via Paystack
        const disbursementResponse = await axios.post(
          'https://api.paystack.co/transfer',
          {
            source: 'balance',
            reason: `Disbursement for event ${eventId}`,
            amount: Math.floor(totalAmount * 100), // Convert to kobo
            recipient: creator.bankAccount.S, // Assumes bankAccount is stored as a string (e.g., Paystack recipient code)
          },
          {
            headers: { Authorization: `Bearer ${API_KEYS.PAYSTACK_SECRET}` },
          }
        );

        if (disbursementResponse.data.status) {
          await updateItem(
            TABLE_NAMES.EVENTS,
            { id: { S: eventId } },
            'SET fundsDisbursed = :true, disbursedAmount = :amount, disbursementDate = :date',
            {
              ':true': { BOOL: true },
              ':amount': { N: totalAmount.toString() },
              ':date': { S: new Date().toISOString() },
            }
          );
          logger.info('Funds disbursed successfully', { eventId, amount: totalAmount });
        } else {
          logger.error('Paystack disbursement failed', { eventId, response: disbursementResponse.data });
        }
      }
    }

    logger.info('Disbursement process completed', { eventCount: events.length });
    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Disbursement process completed' }),
    };
  } catch (error) {
    logger.error('Disburse funds error', { error: error.message, stack: error.stack });
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};