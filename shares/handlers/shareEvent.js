const dynamodb = new AWS.DynamoDB.DocumentClient();
const emailService = require('../../services/emailService');
const { v4: uuidv4 } = require('uuid');

exports.handler = async (event) => {
  try {
    const { eventId, recipients } = JSON.parse(event.body);
    const userId = event.requestContext.authorizer.claims.sub;
    const userEmail = event.requestContext.authorizer.claims.email;

    const [eventResult, userResult] = await Promise.all([
      dynamodb.get({
        TableName: process.env.EVENTS_TABLE,
        Key: { id: eventId }
      }).promise(),
      dynamodb.get({
        TableName: process.env.USERS_TABLE,
        Key: { id: userId }
      }).promise()
    ]);

    if (!eventResult.Item) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Event not found' })
      };
    }

    const share = {
      id: uuidv4(),
      eventId,
      sharedBy: userId,
      sharedByEmail: userEmail,
      sharedWith: recipients.map(email => ({
        email,
        status: 'pending',
        responseDate: null
      })),
      shareDate: new Date().toISOString()
    };

    await dynamodb.put({
      TableName: process.env.SHARES_TABLE,
      Item: share
    }).promise();

    await emailService.sendEventShare({
      ...share,
      event: eventResult.Item,
      sharedBy: userResult.Item
    });

    return {
      statusCode: 200,
      body: JSON.stringify(share)
    };
  } catch (error) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Failed to share event' })
    };
  }
};