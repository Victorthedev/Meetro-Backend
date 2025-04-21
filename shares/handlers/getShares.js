const dynamodb = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
  try {
    const userId = event.requestContext.authorizer.claims.sub;
    const userEmail = event.requestContext.authorizer.claims.email;

    const sharedByMe = await dynamodb.query({
      TableName: process.env.SHARES_TABLE,
      IndexName: 'SharedByIndex',
      KeyConditionExpression: 'sharedBy = :sharedBy',
      ExpressionAttributeValues: {
        ':sharedBy': userId
      }
    }).promise();

    const sharedWithMe = await dynamodb.scan({
      TableName: process.env.SHARES_TABLE,
      FilterExpression: 'contains(sharedWith, :me)',
      ExpressionAttributeValues: {
        ':me': { email: userEmail }
      }
    }).promise();

    const shares = [...sharedByMe.Items, ...sharedWithMe.Items];

    const events = await Promise.all(
      shares.map(share => 
        dynamodb.get({
          TableName: process.env.EVENTS_TABLE,
          Key: { id: share.eventId }
        }).promise()
      )
    );

    const users = await Promise.all(
      shares.map(share => 
        dynamodb.get({
          TableName: process.env.USERS_TABLE,
          Key: { id: share.sharedBy }
        }).promise()
      )
    );

    const enrichedShares = shares.map((share, index) => ({
      ...share,
      event: events[index].Item,
      sharedBy: users[index].Item
    }));

    return {
      statusCode: 200,
      body: JSON.stringify(enrichedShares)
    };
  } catch (error) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Failed to fetch shares' })
    };
  }
};