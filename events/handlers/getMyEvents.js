const dynamodb = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
  try {
    const userId = event.requestContext.authorizer.claims.sub;

    const events = await dynamodb.query({
      TableName: process.env.EVENTS_TABLE,
      IndexName: 'CreatorIndex',
      KeyConditionExpression: 'creator = :creator',
      ExpressionAttributeValues: {
        ':creator': userId
      },
      ScanIndexForward: false
    }).promise();

    return {
      statusCode: 200,
      body: JSON.stringify(events.Items)
    };
  } catch (error) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: error.message })
    };
  }
};