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
    return { 
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
      }
    };
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

  // 6. Process chip-in payments with fee splitting
  if (verifiedData.metadata?.chipInType === 'event') {
    try {
      const { eventId, recipientCode, userId, originalAmount, feeAmount } = verifiedData.metadata;
      const amount = originalAmount; // Amount to send to creator
      const fee = feeAmount; // Amount to keep as platform fee
      
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

      console.log('Processing chip-in donation with fee splitting:', {
        eventId,
        amount,
        fee,
        userId,
        recipientCode
      });

      // 7. Update donation record as completed
      try {
        const updateResult = await updateItem(
          TABLE_NAMES.DONATIONS,
          { paymentReference: verifiedData.reference },
          'SET status = :status, verifiedAt = :now, amount = :amount, fee = :fee',
          {
            ':status': 'completed',
            ':now': new Date().toISOString(),
            ':amount': amount.toString(),
            ':fee': fee.toString()
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

      // 8. Get platform recipient code
      const platformRecipientCode = process.env.PLATFORM_RECIPIENT_CODE;
      if (!platformRecipientCode) {
        throw new Error('Platform recipient code not configured');
      }

      // 9. Initiate transfer to platform (for fees)
      let platformTransferResponse;
      try {
        console.log('Initiating platform fee transfer...');
        platformTransferResponse = await axios.post(
          'https://api.paystack.co/transfer',
          {
            source: 'balance',
            amount: Math.floor(fee * 100), // in kobo
            recipient: platformRecipientCode,
            reason: `Platform fee for event ${eventId}`,
            reference: `XFER_FEE_${verifiedData.reference}`
          },
          {
            headers: { 
              Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
              'Content-Type': 'application/json'
            },
            timeout: 30000
          }
        );
        console.log('Platform fee transfer initiated successfully:', {
          transferReference: platformTransferResponse.data.data.reference,
          status: platformTransferResponse.data.data.status
        });
      } catch (platformTransferError) {
        console.error('Platform fee transfer initiation failed:', {
          error: platformTransferError.message,
          stack: platformTransferError.stack,
          response: platformTransferError.response?.data
        });
        throw platformTransferError;
      }

      // 10. Initiate transfer to creator
      let creatorTransferResponse;
      try {
        console.log('Initiating creator transfer...');
        creatorTransferResponse = await axios.post(
          'https://api.paystack.co/transfer',
          {
            source: 'balance',
            amount: Math.floor(amount * 100), // in kobo
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
        console.log('Creator transfer initiated successfully:', {
          transferReference: creatorTransferResponse.data.data.reference,
          status: creatorTransferResponse.data.data.status
        });
      } catch (creatorTransferError) {
        console.error('Creator transfer initiation failed:', {
          error: creatorTransferError.message,
          stack: creatorTransferError.stack,
          response: creatorTransferError.response?.data
        });
        throw creatorTransferError;
      }

      // 11. Update donation with transfer references
      try {
        const donationUpdate = await updateItem(
          TABLE_NAMES.DONATIONS, 
          { paymentReference: verifiedData.reference },
          'SET transferReference = :ref, platformTransferReference = :platformRef, transferredAt = :now',
          {
            ':ref': creatorTransferResponse.data.data.reference,
            ':platformRef': platformTransferResponse.data.data.reference,
            ':now': new Date().toISOString()
          }
        );
        console.log('Donation transfer references update successful:', donationUpdate);
      } catch (donationUpdateError) {
        console.error('Donation transfer references update failed:', {
          error: donationUpdateError.message,
          stack: donationUpdateError.stack,
          reference: verifiedData.reference
        });
        throw donationUpdateError;
      }

      // 12. Update event with chipInTotal (original amount only)
      try {
        const eventUpdate = await updateItem(
          TABLE_NAMES.EVENTS,
          { id: eventId },
          'ADD chipInTotal :amount SET lastChipIn = :chipIn',
          {
            ':amount': amount,
            ':chipIn': {
              amount,
              transferReference: creatorTransferResponse.data.data.reference,
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

      return { 
        statusCode: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type,Authorization",
          "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
        }
      };

    } catch (processingError) {
      console.error('Chip-in processing with fee splitting failed:', {
        error: processingError.message,
        stack: processingError.stack,
        transaction: verifiedData
      });
      
      // Implement retry logic or manual review process here
      //I might want to log this to a separate table for failed transactions
      
      return {
        statusCode: 500,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type,Authorization",
          "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
        },  
        body: JSON.stringify({
          error: 'Chip-in processing with fee splitting failed',
          reference: verifiedData.reference,
          details: processingError.message
        })
      };
    }
  }

  console.log('No chip-in processing required for this transaction');
  return { 
    statusCode: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
      "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
    }
  };
};