const dynamodb = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
  try {
    const { state, category, page = 1, limit = 10 } = event.queryStringParameters || {};
    const offset = (page - 1) * limit;

    let params = {
      TableName: process.env.EVENTS_TABLE,
      IndexName: 'VisibilityIndex',
      KeyConditionExpression: 'visibility = :visibility AND startDate >= :now',
      ExpressionAttributeValues: {
        ':visibility': 'public',
        ':now': new Date().toISOString()
      },
      Limit: parseInt(limit),
      ExclusiveStartKey: offset ? { id: offset.toString() } : undefined
    };

    if (state) {
      params.FilterExpression = 'location.state = :state';
      params.ExpressionAttributeValues[':state'] = state;
    }

    if (category) {
      params.FilterExpression = params.FilterExpression 
        ? `${params.FilterExpression} AND category = :category`
        : 'category = :category';
      params.ExpressionAttributeValues[':category'] = category;
    }

    const result = await dynamodb.query(params).promise();
    return {
      statusCode: 200,
      body: JSON.stringify(result.Items)
    };
  } catch (error) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: error.message })
    };
  }
};