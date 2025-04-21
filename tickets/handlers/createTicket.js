const dynamodb = new AWS.DynamoDB.DocumentClient();
const { v4: uuidv4 } = require('uuid');

exports.handler = async (event) => {
  try {
    const { eventId, name, type, price, quantity, bankDetails } = JSON.parse(event.body);
    const userId = event.requestContext.authorizer.claims.sub;

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

    if (event.Item.creator !== userId) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: 'Not authorized to create tickets for this event' })
      };
    }

    const ticket = {
      id: uuidv4(),
      eventId,
      name,
      type,
      price: parseFloat(price),
      quantity: parseInt(quantity),
      quantitySold: 0,
      ...(price > 0 && { bankDetails }),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await dynamodb.put({
      TableName: process.env.TICKETS_TABLE,
      Item: ticket
    }).promise();

    return {
      statusCode: 201,
      body: JSON.stringify(ticket)
    };
  } catch (error) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: error.message })
    };
  }
};