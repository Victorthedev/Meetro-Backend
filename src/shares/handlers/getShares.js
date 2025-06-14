const { queryItems } = require('../../utils/db');
const { TABLE_NAMES } = require('../../utils/constants');
const logger = require('../../utils/logger');

exports.handler = async (event) => {
  try {
    const userId = event.requestContext.authorizer.jwt.claims.sub;

    const shares = await queryItems(TABLE_NAMES.SHARES, {
      IndexName: 'bySharedBy',
      KeyConditionExpression: 'sharedBy = :sharedBy',
      ExpressionAttributeValues: { ':sharedBy': userId },
    });

    logger.info('Shares retrieved', { userId, count: shares.length });
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
      },  
      body: JSON.stringify(shares),
    };
  } catch (error) {
    logger.error('Get shares error', { error: error.message, stack: error.stack });
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