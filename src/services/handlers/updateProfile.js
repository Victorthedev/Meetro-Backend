const { upsertUser } = require('../../utils/db');
const { TABLE_NAMES, NIGERIAN_STATES } = require('../../utils/constants');
const { decode } = require('jsonwebtoken');

exports.handler = async (event) => {
  try {
    // Parse input with multiple fallbacks
    const body = typeof event.body === 'string' ? JSON.parse(event.body || '{}') : event.body || {};
    const { firstName, lastName, bio, profilePictureKey, location } = body;

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

    const userData = {};
    if (firstName) userData.firstName = { S: firstName };
    if (lastName) userData.lastName = { S: lastName };
    if (bio) userData.bio = { S: bio };
    if (profilePictureKey) {
      if (!profilePictureKey.startsWith('profiles/')) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'Invalid profile picture format' }),
        };
      }
      userData.profilePictureKey = { S: profilePictureKey };
    }
    if (location) {
      if (location.state && !NIGERIAN_STATES.includes(location.state)) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'Invalid Nigerian state' }),
        };
      }
      userData.location = {
        M: {
          city: { S: location.city || '' },
          state: { S: location.state || '' },
          country: { S: location.country || 'Nigeria' }
        }
      };
    }

    await upsertUser(TABLE_NAMES.USERS, userId, userData);

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Profile updated successfully' }),
    };

  } catch (error) {
    console.error('Update error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};