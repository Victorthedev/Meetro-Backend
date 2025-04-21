const dynamodb = new AWS.DynamoDB.DocumentClient();
const { NIGERIAN_STATES } = require('../../utils/constants');

exports.handler = async (event) => {
  try {
    const { state } = JSON.parse(event.body);
    const userId = event.requestContext.authorizer.claims.sub;

    if (!NIGERIAN_STATES.includes(state)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid Nigerian state' })
      };
    }

    const updatedUser = await dynamodb.update({
      TableName: process.env.USERS_TABLE,
      Key: { id: userId },
      UpdateExpression: 'SET #st = :state, updatedAt = :now',
      ExpressionAttributeNames: {
        '#st': 'state'
      },
      ExpressionAttributeValues: {
        ':state': state,
        ':now': new Date().toISOString()
      },
      ReturnValues: 'ALL_NEW'
    }).promise();

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, state: updatedUser.Attributes.state })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};