const { getItem } = require('../../utils/db');
const { TABLE_NAMES } = require('../../utils/constants');
const logger = require('../../utils/logger');

exports.handler = async (event) => {
  try {
    const userId = event.requestContext.authorizer.jwt.claims.sub;
    const profile = await getItem(TABLE_NAMES.USERS, { userId: { S: userId } });

    if (!profile) {
      logger.error('Profile not found', { userId });
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Profile not found' }),
      };
    }

    logger.info('Profile retrieved', { userId });
    return {
      statusCode: 200,
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
    logger.error('Get profile error', { error: error.message, stack: error.stack });
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};