const dynamodb = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
  try {
    const eventId = event.pathParameters.id;
    const event = await dynamodb.get({
      TableName: process.env.EVENTS_TABLE,
      Key: { id: eventId }
    }).promise();

    if (!event.Item) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Event not found' })
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify(event.Item)
    };
  } catch (error) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: error.message })
    };
  }
};