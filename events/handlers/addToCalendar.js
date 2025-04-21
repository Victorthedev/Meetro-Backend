const dynamodb = new AWS.DynamoDB.DocumentClient();
const calendarService = require('../../services/calendarService');

exports.handler = async (event) => {
  try {
    const eventId = event.pathParameters.id;
    const userId = event.requestContext.authorizer.claims.sub;

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

    if (!userResult.Item) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'User not found' })
      };
    }

    if (userResult.Item.calendarType === 'google') {
      await calendarService.addToGoogleCalendar(userResult.Item, eventResult.Item);
    } else {
      await calendarService.addToAppleCalendar(userResult.Item, eventResult.Item);
    }

    await dynamodb.update({
      TableName: process.env.EVENTS_TABLE,
      Key: { id: eventId },
      UpdateExpression: 'ADD attendees :user',
      ExpressionAttributeValues: {
        ':user': dynamodb.createSet([userId])
      }
    }).promise();

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Event added to calendar' })
    };
  } catch (error) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Failed to add event to calendar' })
    };
  }
};