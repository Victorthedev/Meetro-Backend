const { putItem } = require('../../utils/db');
const { finalizeEventImage } = require('../../utils/upload');
const { TABLE_NAMES, EVENT_CATEGORIES } = require('../../utils/constants');
const { v4: uuidv4 } = require('uuid');
const { decode } = require('jsonwebtoken');
const verifyBankDetails = require('../../utils/accountVerification');
const axios = require('axios'); 

exports.handler = async (event) => {
  try {
    const body = typeof event.body === 'string' ? JSON.parse(event.body || '{}') : event.body || {};
    const { 
      title, 
      description, 
      date, 
      location, 
      ticketTypes, 
      isPrivate, 
      chipInAmount, 
      chipInType,
      chipInSettings,
      category = '', 
      imageKey,
      tempImageKey,
      dressCode,
      bankDetails // Added to the destructured properties
    } = body;

    let userId;
    const authContext = event.requestContext?.authorizer;
    
    if (authContext?.jwt?.claims?.sub) {
      userId = authContext.jwt.claims.sub;
    } 
    else if (authContext?.claims?.sub) {
      userId = authContext.claims.sub;
    }
    else if (event.headers?.Authorization) {
      const token = event.headers.Authorization.split(' ')[1];
      const decoded = decode(token);
      userId = decoded?.sub;
    }

    if (userId && userId.startsWith('eyJ')) {
      const decoded = decode(userId);
      userId = decoded?.sub;
    }

    if (!userId) {
      console.error('Missing user ID in event:', event);
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Unauthorized' })
      };
    }

    if (!title || !date) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Title and date are required' })
      };
    }

    if (!location?.venue || !location?.state) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Venue address and state are required' })
      };
    }

    if (category && !EVENT_CATEGORIES.includes(category)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: `Invalid category. Valid options: ${EVENT_CATEGORIES.join(', ')}` })
      };
    }

    let finalImageKey = imageKey;
    if (tempImageKey && tempImageKey.startsWith('events/temp/')) {
      finalImageKey = await finalizeEventImage(tempImageKey, `${isPrivate ? 'PRI' : 'PUB'}_${uuidv4()}`);
    }

    if (finalImageKey && !finalImageKey.startsWith('events/')) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Image key must start with "events/"' })
      };
    }

    if (chipInAmount) {
      if (!chipInType || !['FIXED', 'FLEXIBLE'].includes(chipInType)) {
        return { 
          statusCode: 400, 
          body: JSON.stringify({ error: 'Invalid chipInType. Must be FIXED or FLEXIBLE' }) 
        };
      }
      
      if (chipInType === 'FIXED' && !chipInSettings?.fixedAmount) {
        return { 
          statusCode: 400, 
          body: JSON.stringify({ error: 'Fixed amount required for FIXED type' }) 
        };
      }
      
      if (chipInType === 'FLEXIBLE' && !chipInSettings?.minAmount) {
        return { 
          statusCode: 400, 
          body: JSON.stringify({ error: 'Min amount required for FLEXIBLE type' }) 
        };
      }

      // NEW: Validate bank details when chip-in is used
      if (!bankDetails || !bankDetails.bankName || !bankDetails.accountNumber || !bankDetails.accountName) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'Bank details (bankName, accountNumber, accountName) are required when using chip-in' })
        };
      }

      const bankVerification = await verifyBankDetails(
        bankDetails.accountNumber,
        bankDetails.bankCode
      );

      if (!bankVerification.isValid) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'Bank account verification failed: ' + bankVerification.error })
        };
      }

      const recipientResponse = await axios.post(
        'https://api.paystack.co/transferrecipient',
        {
          type: 'nuban',
          name: bankVerification.accountName,
          account_number: bankVerification.accountNumber,
          bank_code: bankVerification.bankCode,
          currency: 'NGN'
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const eventId = `${isPrivate ? 'PRI' : 'PUB'}_${uuidv4()}`;
      
      const eventData = {
        id: eventId,
        creator: userId,
        title,
        description: description || '',
        date,
        location: {
          venue: location.venue,
          city: location.city || '',
          state: location.state,
          country: location.country || 'Nigeria'
        },
        ticketTypes: isPrivate ? [] : (ticketTypes || []),
        isPrivate: isPrivate ? 'true' : 'false',
        createdAt: new Date().toISOString(),
        ...(category && { category }),
        ...(finalImageKey && { imageKey: finalImageKey }),
        ...(dressCode && { dressCode }),
      };

      if (chipInAmount) {
        eventData.chipInAmount = chipInAmount;
        eventData.chipInType = chipInType;
        eventData.chipInSettings = chipInSettings;
        eventData.recipientCode = recipientResponse.data.data.recipient_code;
        eventData.bankDetails = {
          bankName: bankDetails.bankName,
          accountNumber: bankDetails.accountNumber,
          accountName: bankDetails.accountName
        };
      }

      await putItem(TABLE_NAMES.EVENTS, eventData);

      return {
        statusCode: 200,
        body: JSON.stringify({ 
          eventId,
          ...(finalImageKey && { imageKey: finalImageKey }),
          message: 'Event created successfully'
        })
      };
    }

    // Handle case when chipInAmount is not provided
    const eventId = `${isPrivate ? 'PRI' : 'PUB'}_${uuidv4()}`;
    
    const eventData = {
      id: eventId,
      creator: userId,
      title,
      description: description || '',
      date,
      location: {
        venue: location.venue,
        city: location.city || '',
        state: location.state,
        country: location.country || 'Nigeria'
      },
      ticketTypes: isPrivate ? [] : (ticketTypes || []),
      isPrivate: isPrivate ? 'true' : 'false',
      createdAt: new Date().toISOString(),
      ...(category && { category }),
      ...(finalImageKey && { imageKey: finalImageKey }),
      ...(dressCode && { dressCode }),
    };

    await putItem(TABLE_NAMES.EVENTS, eventData);

    return {
      statusCode: 200,
      body: JSON.stringify({ 
        eventId,
        ...(finalImageKey && { imageKey: finalImageKey }),
        message: 'Event created successfully'
      })
    };

  } catch (error) {
    console.error('Create event failed', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};