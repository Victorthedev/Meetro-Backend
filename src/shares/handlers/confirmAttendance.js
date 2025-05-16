const { putItem, getItem, updateItem } = require('../../utils/db');
const { TABLE_NAMES } = require('../../utils/constants');
const logger = require('../../utils/logger');
const { addToCalendar } = require('../../events/handlers/addToCalendar');
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

    if (!share || !share.friendEmails.L.some(email => email.S === userId)) {
      console.error('Share not found or user not authorized', { shareId, userId });
      return {
        statusCode: 403,
        body: JSON.stringify({ error: 'Unauthorized' }),
      };
    }

    await updateItem(TABLE_NAMES.SHARES, { id: { S: shareId } }, 'SET attendees = list_append(if_not_exists(attendees, :empty), :userId)', {
      ':userId': { L: [{ S: userId }] },
      ':empty': { L: [] },
    });

    // Add event to calendar or send ICS file
    try {
      await addToCalendar(userId, share.eventId.S);
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