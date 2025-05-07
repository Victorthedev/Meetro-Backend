const { getItem, updateItem } = require('../../utils/db');
const { TABLE_NAMES } = require('../../utils/constants');
const logger = require('../../utils/logger');

exports.handler = async (event) => {
  try {
    const { shareId } = event.pathParameters || {};
    if (!shareId) {
      logger.error('Missing shareId');
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing shareId' }),
      };
    }

    const userId = event.requestContext.authorizer.jwt.claims.sub;
    const share = await getItem(TABLE_NAMES.SHARES, { id: { S: shareId } });

    if (!share || !share.friendEmails.L.some(email => email.S === userId)) {
      logger.error('Share not found or user not authorized', { shareId, userId });
      return {
        statusCode: 403,
        body: JSON.stringify({ error: 'Unauthorized' }),
      };
    }

    await updateItem(TABLE_NAMES.SHARES, { id: { S: shareId } }, 'SET attendees = list_append(if_not_exists(attendees, :empty), :userId)', {
      ':userId': { L: [{ S: userId }] },
      ':empty': { L: [] },
    });

    logger.info('Attendance confirmed', { userId, shareId });
    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Attendance confirmed' }),
    };
  } catch (error) {
    logger.error('Confirm attendance error', { error: error.message, stack: error.stack });
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};