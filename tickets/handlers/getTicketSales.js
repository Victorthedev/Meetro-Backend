const dynamodb = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
  try {
    const eventId = event.pathParameters.eventId;
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
        body: JSON.stringify({ error: 'Not authorized to view sales for this event' })
      };
    }

    const tickets = await dynamodb.query({
      TableName: process.env.TICKETS_TABLE,
      IndexName: 'EventIndex',
      KeyConditionExpression: 'eventId = :eventId',
      ExpressionAttributeValues: {
        ':eventId': eventId
      }
    }).promise();

    const purchases = await dynamodb.query({
      TableName: process.env.PURCHASES_TABLE,
      IndexName: 'EventIndex',
      KeyConditionExpression: 'eventId = :eventId',
      FilterExpression: 'paymentStatus = :status',
      ExpressionAttributeValues: {
        ':eventId': eventId,
        ':status': 'completed'
      }
    }).promise();

    const totalSales = purchases.Items.reduce((sum, p) => sum + p.totalAmount, 0);
    const platformFees = purchases.Items.reduce((sum, p) => sum + p.platformFee, 0);

    return {
      statusCode: 200,
      body: JSON.stringify({
        tickets: tickets.Items,
        purchases: purchases.Items,
        totalSales,
        platformFees,
        netAmount: totalSales - platformFees
      })
    };
  } catch (error) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: error.message })
    };
  }
};