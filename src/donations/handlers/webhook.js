const axios = require('axios');
const crypto = require('crypto');
const { updateItem } = require('../../utils/db');
const { TABLE_NAMES } = require('../../utils/constants');

exports.handler = async (event) => {
  // 1. Initial request validation and logging
  console.log('Webhook received:', {
    headers: event.headers,
    rawBody: event.body,
    method: event.httpMethod,
    path: event.path
  });

  if (!process.env.PAYSTACK_SECRET_KEY) {
    console.error('Critical Error: PAYSTACK_SECRET_KEY is not set in environment variables');
    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
      },  
      body: JSON.stringify({ error: 'Server configuration error' })
    };
  }

  // 2. Parse and validate payload
  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
    console.log('Parsed payload:', payload);
  } catch (parseError) {
    console.error('Payload parse error:', {
      error: parseError.message,
      stack: parseError.stack,
      rawBody: event.body
    });
    return {
      statusCode: 400,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
      },  
      body: JSON.stringify({ error: 'Invalid payload format' })
    };
  }

  // 3. Verify Paystack signature
  try {
    const hash = crypto.createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
                     .update(JSON.stringify(payload))
                     .digest('hex');
    
    const signature = event.headers['x-paystack-signature'];
    
    console.log('Signature verification:', {
      computedHash: hash,
      receivedSignature: signature,
      match: hash === signature
    });

    if (hash !== signature) {
      console.error('Unauthorized webhook attempt');
      return { 
        statusCode: 401, 
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type,Authorization",
          "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
        },  
        body: JSON.stringify({ error: 'Unauthorized webhook' }) 
      };
    }
  } catch (cryptoError) {
    console.error('Signature verification failed:', {
      error: cryptoError.message,
      stack: cryptoError.stack
    });
    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
      },  
      body: JSON.stringify({ error: 'Signature verification failed' })
    };
  }

  // 4. Process only successful charges
  if (payload.event !== 'charge.success') {
    console.log('Skipping non-charge event:', payload.event);
    return { statusCode: 200,       headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
      "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
    },   };
  }

  const transaction = payload.data;
  console.log('Processing transaction:', {
    reference: transaction.reference,
    amount: transaction.amount,
    metadata: transaction.metadata
  });

  // 5. Verify transaction with Paystack
  let verifiedData;
  try {
    console.log('Verifying transaction with Paystack...');
    const verification = await axios.get(
      `https://api.paystack.co/transaction/verify/${transaction.reference}`,
      {
        headers: { 
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000 
      }
    );

    verifiedData = verification.data.data;
    console.log('Transaction verification successful:', {
      status: verifiedData.status,
      amount: verifiedData.amount,
      metadata: verifiedData.metadata
    });
  } catch (verificationError) {
    console.error('Transaction verification failed:', {
      error: verificationError.message,
      stack: verificationError.stack,
      response: verificationError.response?.data,
      reference: transaction.reference
    });
    return {
      statusCode: 502,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
      },  
      body: JSON.stringify({ 
        error: 'Transaction verification failed',
        reference: transaction.reference
      })
    };
  }

  // 6. Process chip-in payments
  if (verifiedData.metadata?.chipInType === 'event') {
    try {
      const { eventId, recipientCode, userId } = verifiedData.metadata;
      const amount = verifiedData.amount / 100;

      if (!eventId || !recipientCode) {
        console.error('Missing required metadata:', {
          eventIdPresent: !!eventId,
          recipientCodePresent: !!recipientCode
        });
        return {
          statusCode: 400,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
            "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
          },  
          body: JSON.stringify({ error: 'Missing required metadata fields' })
        };
      }

      console.log('Processing chip-in donation:', {
        eventId,
        amount,
        userId,
        recipientCode
      });

      // 7. Update donation record
      try {
        const updateResult = await updateItem(
          TABLE_NAMES.DONATIONS,
          { paymentReference: verifiedData.reference },
          'SET status = :status, verifiedAt = :now, amount = :amount',
          {
            ':status': 'completed',
            ':now': new Date().toISOString(),
            ':amount': amount.toString()
          }
        );
        console.log('Donation update successful:', updateResult);
      } catch (updateError) {
        console.error('Donation update failed:', {
          error: updateError.message,
          stack: updateError.stack,
          reference: verifiedData.reference
        });
        throw updateError;
      }

      // 8. Initiate transfer
      let transferResponse;
      try {
        console.log('Initiating transfer...');
        transferResponse = await axios.post(
          'https://api.paystack.co/transfer',
          {
            source: 'balance',
            amount: Math.floor(amount * 100),
            recipient: recipientCode,
            reason: `Chip-in for event ${eventId}`,
            reference: `XFER_${verifiedData.reference}`
          },
          {
            headers: { 
              Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
              'Content-Type': 'application/json'
            },
            timeout: 30000
          }
        );
        console.log('Transfer initiated successfully:', {
          transferReference: transferResponse.data.data.reference,
          status: transferResponse.data.data.status
        });
      } catch (transferError) {
        console.error('Transfer initiation failed:', {
          error: transferError.message,
          stack: transferError.stack,
          response: transferError.response?.data
        });
        throw transferError;
      }

      // 9. Update event with transfer details
      try {
        const eventUpdate = await updateItem(
          TABLE_NAMES.EVENTS,
          { id: eventId },
          'ADD chipInTotal :amount SET lastChipIn = :chipIn',
          {
            ':amount': amount,
            ':chipIn': {
              amount,
              transferReference: transferResponse.data.data.reference,
              transferredAt: new Date().toISOString(),
              userId
            }
          }
        );
        console.log('Event update successful:', eventUpdate);
      } catch (eventUpdateError) {
        console.error('Event update failed:', {
          error: eventUpdateError.message,
          stack: eventUpdateError.stack,
          eventId
        });
        throw eventUpdateError;
      }

      // 10. Update donation with transfer reference
      try {
        const donationUpdate = await updateItem(
          TABLE_NAMES.DONATIONS, 
          { paymentReference: verifiedData.reference },
          'SET transferReference = :ref, transferredAt = :now',
          {
            ':ref': transferResponse.data.data.reference,
            ':now': new Date().toISOString()
          }
        );
        console.log('Donation transfer reference update successful:', donationUpdate);
      } catch (donationUpdateError) {
        console.error('Donation transfer reference update failed:', {
          error: donationUpdateError.message,
          stack: donationUpdateError.stack,
          reference: verifiedData.reference
        });
        throw donationUpdateError;
      }

      return { statusCode: 200,       headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
      },   };

    } catch (processingError) {
      console.error('Chip-in processing failed:', {
        error: processingError.message,
        stack: processingError.stack,
        transaction: verifiedData
      });
      return {
        statusCode: 500,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type,Authorization",
          "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
        },  
        body: JSON.stringify({
          error: 'Chip-in processing failed',
          reference: verifiedData.reference
        })
      };
    }
  }

  console.log('No chip-in processing required for this transaction');
  return { statusCode: 200,       headers: {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
  },   };
};