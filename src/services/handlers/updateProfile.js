const { updateItem } = require('../../utils/db');
const { TABLE_NAMES, NIGERIAN_STATES } = require('../../utils/constants');
const logger = require('../../utils/logger');

exports.handler = async (event) => {
  try {
    const { firstName, lastName, bio, profilePictureKey, location } = JSON.parse(event.body || '{}');
    if (!firstName && !lastName && !bio && !profilePictureKey && !location) {
      logger.error('No fields to update', { fields: { firstName, lastName, bio, profilePictureKey, location } });
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'No fields to update' }),
      };
    }

    if (profilePictureKey && !profilePictureKey.startsWith('profiles/')) {
      logger.error('Invalid profilePictureKey format', { profilePictureKey });
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid profilePictureKey. Must start with "profiles/"' }),
      };
    }

    const userId = event.requestContext.authorizer.jwt.claims.sub;
    const updateExpressionParts = [];
    const expressionAttributeValues = {};

    if (firstName) {
      updateExpressionParts.push('#firstName = :firstName');
      expressionAttributeValues[':firstName'] = { S: firstName };
    }
    if (lastName) {
      updateExpressionParts.push('#lastName = :lastName');
      expressionAttributeValues[':lastName'] = { S: lastName };
    }
    if (bio) {
      updateExpressionParts.push('#bio = :bio');
      expressionAttributeValues[':bio'] = { S: bio };
    }
    if (profilePictureKey) {
      updateExpressionParts.push('#profilePictureKey = :profilePictureKey');
      expressionAttributeValues[':profilePictureKey'] = { S: profilePictureKey };
    }
    if (location) {
      if (location.state && !NIGERIAN_STATES.includes(location.state)) {
        logger.error('Invalid Nigerian state', { state: location.state });
        return {
          statusCode: 400,
          body: JSON.stringify({ error: `Invalid state. Must be one of: ${NIGERIAN_STATES.join(', ')}` }),
        };
      }
      updateExpressionParts.push('#location = :location');
      expressionAttributeValues[':location'] = {
        M: {
          city: { S: location.city || '' },
          state: { S: location.state || '' },
          country: { S: location.country || '' },
        },
      };
    }

    if (updateExpressionParts.length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'No valid fields to update' }),
      };
    }

    const updateExpression = `SET ${updateExpressionParts.join(', ')}`;
    await updateItem(TABLE_NAMES.USERS, { userId: { S: userId } }, updateExpression, expressionAttributeValues, {
      '#firstName': 'firstName',
      '#lastName': 'lastName',
      '#bio': 'bio',
      '#profilePictureKey': 'profilePictureKey',
      '#location': 'location',
    });

    logger.info('Profile updated', { userId });
    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Profile updated successfully' }),
    };
  } catch (error) {
    logger.error('Update profile error', { error: error.message, stack: error.stack });
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};