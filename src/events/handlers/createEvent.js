const { putItem } = require('../../utils/db');
const { finalizeEventImage } = require('../../utils/upload');
const { TABLE_NAMES, EVENT_CATEGORIES } = require('../../utils/constants');
const { v4: uuidv4 } = require('uuid');
const { decode } = require('jsonwebtoken');
const verifyBankDetails = require('../../services/handlers/accountVerification');
const axios = require('axios'); 

exports.handler = async (event) => {
  try {
    const body = typeof event.body === 'string' ? JSON.parse(event.body || '{}') : event.body || {};
    const { 
      title, 
      description, 
      date, 
      timeFrom, 
      timeTo,
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
      bankDetails,
      theme = 1,        
      fontStyle = 1,     
      isLightMode = true  
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
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type,Authorization",
          "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
        },  
        body: JSON.stringify({ error: 'Unauthorized' })
      };
    }

    if (!title || !date || !timeFrom) {
      return {
        statusCode: 400,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type,Authorization",
          "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
        },  
        body: JSON.stringify({ error: 'Title and date are required' })
      };
    }

    if (!location?.venue || !location?.state) {
      return {
        statusCode: 400,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type,Authorization",
          "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
        },  
        body: JSON.stringify({ error: 'Venue address and state are required' })
      };
    }

    if (category && !EVENT_CATEGORIES.includes(category)) {
      return {
        statusCode: 400,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type,Authorization",
          "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
        },  
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
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type,Authorization",
          "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
        },  
        body: JSON.stringify({ error: 'Image key must start with "events/"' })
      };
    }

    if (chipInAmount) {
      if (!chipInType || !['FIXED', 'FLEXIBLE'].includes(chipInType)) {
        return { 
          statusCode: 400, 
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
            "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
          },  
          body: JSON.stringify({ error: 'Invalid chipInType. Must be FIXED or FLEXIBLE' }) 
        };
      }
      
      if (chipInType === 'FIXED' && !chipInSettings?.fixedAmount) {
        return { 
          statusCode: 400, 
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
            "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
          },  
          body: JSON.stringify({ error: 'Fixed amount required for FIXED type' }) 
        };
      }
      
      if (chipInType === 'FLEXIBLE' && !chipInSettings?.minAmount) {
        return { 
          statusCode: 400,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
            "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
          },   
          body: JSON.stringify({ error: 'Min amount required for FLEXIBLE type' }) 
        };
      }

      if (!bankDetails || !bankDetails.bankName || !bankDetails.accountNumber || !bankDetails.accountName) {
        return {
          statusCode: 400,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
            "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
          },  
          body: JSON.stringify({ error: 'Bank details (bankName, accountNumber, accountName) are required when using chip-in' })
        };
      }

      const recipientResponse = await axios.post(
        'https://api.paystack.co/transferrecipient',
        {
          type: 'nuban',
          name: bankDetails.accountName,
          account_number: bankDetails.accountNumber,
          bank_code: bankDetails.bankCode,
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
        timeFrom,
        ...(timeTo && { timeTo }),  
        location: {
          venue: location.venue,
          city: location.city || '',
          state: location.state,
          country: location.country || 'Nigeria'
        },
        ticketTypes: isPrivate ? [] : (ticketTypes || []),
        isPrivate: isPrivate ? 'true' : 'false',
        createdAt: new Date().toISOString(),
        theme,
        fontStyle,
        isLightMode,
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
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type,Authorization",
          "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
        },  
        body: JSON.stringify({ 
          eventId,
          ...(finalImageKey && { imageKey: finalImageKey }),
          message: 'Event created successfully'
        })
      };
    }

    const eventId = `${isPrivate ? 'PRI' : 'PUB'}_${uuidv4()}`;
    
    const eventData = {
      id: eventId,
      creator: userId,
      title,
      description: description || '',
      date,
      timeFrom,  // Added timeFrom
      ...(timeTo && { timeTo }),  
      location: {
        venue: location.venue,
        city: location.city || '',
        state: location.state,
        country: location.country || 'Nigeria'
      },
      ticketTypes: isPrivate ? [] : (ticketTypes || []),
      isPrivate: isPrivate ? 'true' : 'false',
      createdAt: new Date().toISOString(),
      theme,
      fontStyle,
      isLightMode,
      ...(category && { category }),
      ...(finalImageKey && { imageKey: finalImageKey }),
      ...(dressCode && { dressCode }),
    };

    await putItem(TABLE_NAMES.EVENTS, eventData);

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
      },  
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
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
      },  
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};