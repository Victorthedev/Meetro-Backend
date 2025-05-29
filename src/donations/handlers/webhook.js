const axios = require('axios');
const { updateItem } = require('../../utils/db');
const { TABLE_NAMES } = require('../../utils/constants');

exports.handler = async (event) => {
  try {
    const payload = JSON.parse(event.body || '{}');
    
    // Verify this is a successful payment webhook
    if (payload.event !== 'charge.success') {
      return { statusCode: 200, body: JSON.stringify({ message: 'Not a charge.success event' }) };
    }

    const transaction = payload.data;
    
    // Verify the transaction with Paystack
    const verification = await axios.get(
      `https://api.paystack.co/transaction/verify/${transaction.reference}`,
      {
        headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` }
      }
    );

    const verifiedData = verification.data.data;
    
    // Check if this is a chip-in payment
    if (verifiedData.metadata?.chipInType === 'event') {
      const eventId = verifiedData.metadata.eventId;
      const recipientCode = verifiedData.metadata.recipientCode;
      const amount = verifiedData.amount / 100; // Convert back to Naira

      // 1. Update chip-in record
      await updateItem(
        TABLE_NAMES.DONATIONS,
        { paymentReference: verifiedData.reference },
        'SET status = :status, verifiedAt = :now',
        {
          ':status': 'completed',
          ':now': new Date().toISOString()
        }
      );

      // 2. Immediately transfer to creator
      const transferResponse = await axios.post(
        'https://api.paystack.co/transfer',
        {
          source: 'balance',
          amount: Math.floor(amount * 100), // In kobo
          recipient: recipientCode,
          reason: `Chip-in for event ${eventId}`,
          reference: `CHIPIN_XFER_${verifiedData.reference}`
        },
        {
          headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` }
        }
      );

      // 3. Update event with chip-in total and transfer details
      await updateItem(
        TABLE_NAMES.EVENTS,
        { id: eventId },
        'ADD chipInTotal :amount SET lastChipIn = :chipIn',
        {
          ':amount': amount,
          ':chipIn': {
            amount,
            transferReference: transferResponse.data.data.reference,
            transferredAt: new Date().toISOString()
          }
        }
      );

      // 4. Update chip-in record with transfer details
      await updateItem(
        TABLE_NAMES.CHIP_INS,
        { paymentReference: verifiedData.reference },
        'SET transferReference = :ref, transferredAt = :now',
        {
          ':ref': transferResponse.data.data.reference,
          ':now': new Date().toISOString()
        }
      );
    }

    return { statusCode: 200, body: JSON.stringify({ message: 'Webhook processed successfully' }) };
  } catch (error) {
    console.error('Webhook processing error:', error);
    
    // Detailed error response
    const errorResponse = {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Webhook processing failed',
        details: error.response?.data || error.message
      })
    };
    
    return errorResponse;
  }
};