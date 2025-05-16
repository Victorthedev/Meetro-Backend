const { putItem } = require('../../utils/db');
const { TABLE_NAMES, EVENT_CATEGORIES } = require('../../utils/constants');
const { v4: uuidv4 } = require('uuid');
const { decode } = require('jsonwebtoken');

exports.handler = async (event) => {
  try {
    // Parse input - ADD chipInType AND chipInSettings TO DESTRUCTURING
    const body = typeof event.body === 'string' ? JSON.parse(event.body || '{}') : event.body || {};
    const { 
      title, 
      description, 
      date, 
      location, 
      ticketTypes, 
      isPrivate, 
      chipInAmount, 
      chipInType,       // Added this
      chipInSettings,   // Added this
      category = '', 
      imageKey 
    } = body;

    // Multi-format JWT extraction
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

    // Validation checks (unchanged except for chipIn validation)
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

    if (imageKey && !imageKey.startsWith('events/')) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Image key must start with "events/"' })
      };
    }

    // FIXED: Now properly checking defined variables
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
    }

    // Create event
    const eventId = `${isPrivate ? 'PRI' : 'PUB'}_${uuidv4()}`;
    
    await putItem(TABLE_NAMES.EVENTS, {
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
      ...(chipInAmount && { 
        chipInAmount: parseFloat(chipInAmount),
        chipInType,
        chipInSettings
      }),
      createdAt: new Date().toISOString(),
      ...(category && { category }),
      ...(imageKey && { imageKey })
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ 
        eventId,
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