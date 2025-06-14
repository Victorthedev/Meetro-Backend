const { putItem, getItem } = require('../../utils/db');
const { TABLE_NAMES } = require('../../utils/constants');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || '{}');
    const { eventId, amount, userEmail } = body;
    
    if (!eventId || !amount || !userEmail) {
      return {
        statusCode: 400,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type,Authorization",
          "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
        },  
        body: JSON.stringify({ error: 'Missing required fields' })
      };
    }

    // Get event details
    const eventData = await getItem(TABLE_NAMES.EVENTS, { id: eventId });
    console.log('Retrieved event data:', JSON.stringify(eventData, null, 2));

    if (!eventData) {
      return {
        statusCode: 404,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type,Authorization",
          "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
        },  
        body: JSON.stringify({ error: 'Event not found' })
      };
    }

    // Check if chip-in is enabled
    if (!eventData.chipInAmount || !eventData.recipientCode) {
      return {
        statusCode: 400,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type,Authorization",
          "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
        },  
        body: JSON.stringify({ 
          error: 'Event does not accept chip-ins or is not properly configured',
          details: {
            hasChipInAmount: !!eventData.chipInAmount,
            hasRecipientCode: !!eventData.recipientCode
          }
        })
      };
    }

    // Validate amount
    const parsedAmount = parseFloat(amount);
    if (eventData.chipInType === 'FIXED') {
      if (parsedAmount !== parseFloat(eventData.chipInSettings.fixedAmount)) {
        return {
          statusCode: 400,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
            "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
          },  
          body: JSON.stringify({ 
            error: `This event requires exactly ₦${eventData.chipInSettings.fixedAmount}` 
          })
        };
      }
    } else if (eventData.chipInType === 'FLEXIBLE') {
      if (parsedAmount < parseFloat(eventData.chipInSettings.minAmount)) {
        return {
          statusCode: 400,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
            "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
          },  
          body: JSON.stringify({ 
            error: `Minimum chip-in amount is ₦${eventData.chipInSettings.minAmount}` 
          })
        };
      }
    }

    // IMPROVED USER ID EXTRACTION (ONLY CHANGE MADE)
    const authContext = event.requestContext?.authorizer;
    const userId = authContext?.jwt?.claims?.sub || 
                  authContext?.claims?.sub ||
                  authContext?.lambda?.sub;
    
    console.log('Auth context:', JSON.stringify(authContext, null, 2)); // Debug log

    if (!userId) {
      return {
        statusCode: 401,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type,Authorization",
          "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
        },  
        body: JSON.stringify({ 
          error: 'Unauthorized - missing user ID',
          details: {
            authContextPresent: !!authContext,
            possibleLocations: {
              jwtClaims: authContext?.jwt?.claims,
              regularClaims: authContext?.claims,
              lambda: authContext?.lambda
            }
          }
        })
      };
    }

    const paymentReference = `CHIPIN_${uuidv4()}`;

    // Initialize payment
    const paymentResponse = await axios.post(
      'https://api.paystack.co/transaction/initialize',
      {
        email: userEmail,
        amount: parsedAmount * 100,
        reference: paymentReference,
        metadata: {
          eventId,
          userId, // Include userId in metadata for reference
          chipInType: 'event',
          recipientCode: eventData.recipientCode
        }
      },
      {
        headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` }
      }
    );

    // Save donation record with both userId and userEmail
    await putItem(TABLE_NAMES.DONATIONS, {
      id: `DON_${uuidv4()}`,
      eventId,
      userId, // Now saving userId
      userEmail,
      amount: parsedAmount.toString(),
      status: 'pending',
      paymentReference: paymentResponse.data.data.reference,
      recipientCode: eventData.recipientCode,
      createdAt: new Date().toISOString()
    });

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
      },  
      body: JSON.stringify({
        paymentUrl: paymentResponse.data.data.authorization_url,
        message: 'Payment initialized successfully',
        donationDetails: {
          userId,
          userEmail,
          eventId,
          amount: parsedAmount
        }
      })
    };

  } catch (error) {
    console.error('Donation processing failed:', {
      message: error.message,
      stack: error.stack,
      responseData: error.response?.data
    });
    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
      },  
      body: JSON.stringify({ 
        error: 'Payment processing failed',
        details: error.response?.data || error.message
      })
    };
  }
};