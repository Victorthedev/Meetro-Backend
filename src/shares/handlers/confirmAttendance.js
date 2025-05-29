const { putItem, getItem, updateItem } = require('../../utils/db');
const { TABLE_NAMES } = require('../../utils/constants');
const calendarHandler = require('../../events/handlers/addToCalendar');
const { decode } = require('jsonwebtoken');

exports.handler = async (event) => {
  try {
    // Parse input with multiple fallbacks
    const body = typeof event.body === 'string' ? JSON.parse(event.body || '{}') : event.body || {};
    const { shareId } = event.pathParameters || {};
    
    // Validate required fields
    if (!shareId) {
      console.error('Missing shareId');
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing shareId' }),
      };
    }
    
    // Multi-format JWT extraction
    let userId;
    const authContext = event.requestContext?.authorizer;
    
    // Case 1: Standard API Gateway with Cognito
    if (authContext?.jwt?.claims?.sub) {
      userId = authContext.jwt.claims.sub;
    }
    // Case 2: Proxy integration format
    else if (authContext?.claims?.sub) {
      userId = authContext.claims.sub;
    }
    // Case 3: Fallback to Authorization header
    else if (event.headers?.Authorization) {
      const token = event.headers.Authorization.split(' ')[1];
      const decoded = decode(token);
      userId = decoded?.sub;
    }
    
    // Handle JWT-as-ID case
    if (userId && userId.startsWith('eyJ')) {
      const decoded = decode(userId);
      userId = decoded?.sub;
    }
    
    if (!userId) {
      console.error('Missing user ID in event:', JSON.stringify(event, null, 2));
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Invalid user identity' }),
      };
    }
    
    const share = await getItem(TABLE_NAMES.SHARES, { id: { S: shareId } });
    
    if (!share) {
      console.error('Share not found', { shareId, userId });
      return {
        statusCode: 403,
        body: JSON.stringify({ error: 'Share not found' }),
      };
    }
    
    // Fetch user's email from USERS table
    const user = await getItem(TABLE_NAMES.USERS, { userId: { S: userId } });
    if (!user || !user.email?.S) {
      console.error('User or user email not found', { userId });
      return {
        statusCode: 403,
        body: JSON.stringify({ error: 'User or email not found' }),
      };
    }
    
    // Check if user's email is in friendEmails (with proper validation)
    const userEmail = user.email.S.toLowerCase();
    
    // Validate friendEmails exists and is properly structured
    if (!share.friendEmails || !share.friendEmails.L || !Array.isArray(share.friendEmails.L)) {
      console.error('Invalid share structure: missing or invalid friendEmails', { 
        shareId, 
        userId,
        shareStructure: JSON.stringify(share)
      });
      return {
        statusCode: 403,
        body: JSON.stringify({ error: 'Invalid share structure' }),
      };
    }
    
    // Safely map friendEmails to lowercase strings - handling complex nested structure
    const friendEmails = share.friendEmails.L
      .filter(email => {
        // Handle both formats: {S: "email"} and {M: {S: {S: "email"}}}
        return (email && email.S) || (email && email.M && email.M.S && email.M.S.S);
      })
      .map(email => {
        // Extract the email value from either structure
        return email.S ? email.S.toLowerCase() : email.M.S.S.toLowerCase();
      });
    
    if (!friendEmails.includes(userEmail)) {
      console.error('User not authorized for share', {
        shareId,
        userId,
        userEmail,
        friendEmails
      });
      return {
        statusCode: 403,
        body: JSON.stringify({ error: 'User email not in share invite list' }),
      };
    }
    
    // Validate eventId exists
    if (!share.eventId || !share.eventId.S) {
      console.error('Invalid share structure: missing eventId', { shareId });
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Share missing eventId' }),
      };
    }
    
    await updateItem(TABLE_NAMES.SHARES, { id: { S: shareId } }, 'SET attendees = list_append(if_not_exists(attendees, :empty), :userId)', {
      ':userId': { L: [{ S: userId }] },
      ':empty': { L: [] },
    });
    
    // Add event to calendar or send ICS file
    try {
      // Call the handler function with an event-like structure
      await calendarHandler.handler({
        pathParameters: { eventId: share.eventId.S },
        requestContext: {
          authorizer: {
            claims: { sub: userId }
          }
        }
      });
    } catch (calendarError) {
      console.error('Failed to add event to calendar or send ICS', { error: calendarError.message, stack: calendarError.stack });
      // Continue with success response to avoid blocking attendance confirmation
    }
    
    console.log('Attendance confirmed', { userId, shareId });
    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Attendance confirmed' }),
    };
  } catch (error) {
    console.error('Confirm attendance error', { error: error.message, stack: error.stack });
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};