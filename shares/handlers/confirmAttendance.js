const dynamodb = new AWS.DynamoDB.DocumentClient();
const emailService = require('../../services/emailService');

exports.handler = async (event) => {
  try {
    const { shareId, response } = JSON.parse(event.body);
    const userEmail = event.requestContext.authorizer.claims.email;

    const share = await dynamodb.get({
      TableName: process.env.SHARES_TABLE,
      Key: { id: shareId }
    }).promise();

    if (!share.Item) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Share not found' })
      };
    }

    const recipientIndex = share.Item.sharedWith.findIndex(
      r => r.email === userEmail
    );

    if (recipientIndex === -1) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: 'Not authorized to confirm this share' })
      };
    }

    share.Item.sharedWith[recipientIndex].status = response;
    share.Item.sharedWith[recipientIndex].responseDate = new Date().toISOString();

    await dynamodb.put({
      TableName: process.env.SHARES_TABLE,
      Item: share.Item
    }).promise();

    if (response === 'accepted') {
      const [event, sharedBy] = await Promise.all([
        dynamodb.get({
          TableName: process.env.EVENTS_TABLE,
          Key: { id: share.Item.eventId }
        }).promise(),
        dynamodb.get({
          TableName: process.env.USERS_TABLE,
          Key: { id: share.Item.sharedBy }
        }).promise()
      ]);

      await emailService.sendAttendanceConfirmation({
        ...share.Item,
        event: event.Item,
        sharedBy: sharedBy.Item
      }, { email: userEmail });
    }

    return {
      statusCode: 200,
      body: JSON.stringify(share.Item)
    };
  } catch (error) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Failed to confirm attendance' })
    };
  }
};