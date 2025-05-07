const { generateUploadUrl } = require('../../utils/upload');
const { BUCKET_NAME } = require('../../utils/constants');
const logger = require('../../utils/logger');

exports.handler = async (event) => {
  try {
    const { fileName } = JSON.parse(event.body || '{}');
    if (!fileName) {
      logger.error('Missing fileName');
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing fileName' }),
      };
    }

    const userId = event.requestContext.authorizer.jwt.claims.sub;
    const { url, key } = await generateUploadUrl(`${userId}/${fileName}`);

    logger.info('Upload URL generated', { userId, fileName, key });
    return {
      statusCode: 200,
      body: JSON.stringify({ uploadUrl: url, fileKey: key, message: 'Upload URL generated' }),
    };
  } catch (error) {
    logger.error('Get upload URL error', { error: error.message, stack: error.stack });
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};