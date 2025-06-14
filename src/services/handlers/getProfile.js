const { getItem } = require('../../utils/db');
const { TABLE_NAMES } = require('../../utils/constants');
const { decode } = require('jsonwebtoken'); // Add this line

exports.handler = async (event) => {
  try {
    // Replace this line:
    // const userId = event.requestContext.authorizer.jwt.claims.sub;
    
    // With this:
    const rawToken = event.requestContext.authorizer.jwt.claims.sub;
    const decoded = decode(rawToken);
    const userId = decoded.sub;

    // EVERYTHING ELSE BELOW REMAINS EXACTLY THE SAME
    const profile = await getItem(TABLE_NAMES.USERS, { userId: { S: userId } });

    if (!profile) {
      console.error('Profile not found', { userId });
      return {
        statusCode: 404,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type,Authorization",
          "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
        },  
        body: JSON.stringify({ error: 'Profile not found' }),
      };
    }

    console.log('Profile retrieved', { userId });
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
      },  
      body: JSON.stringify({
        userId: profile.userId.S,
        email: profile.email.S,
        firstName: profile.firstName.S,
        lastName: profile.lastName.S,
        bio: profile.bio?.S || '',
        profilePictureKey: profile.profilePictureKey?.S || '',
        state: profile.location?.M?.state?.S || '',
        createdAt: profile.createdAt.S,
      }),
    };
  } catch (error) {
    console.error('Get profile error', { error: error.message, stack: error.stack });
    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
      },  
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};