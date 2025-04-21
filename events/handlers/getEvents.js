const dynamodb = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
  try {
    const { state, page = 1, limit = 10 } = event.queryStringParameters || {};
    const offset = (page - 1) * limit;

    let params = {
      TableName: process.env.EVENTS_TABLE,
      Limit: parseInt(limit),
      ExclusiveStartKey: offset ? { id: offset.toString() } : undefined
    };

    if (state) {
      params.IndexName = 'LocationIndex';
      params.KeyConditionExpression = 'location.state = :state';
      params.ExpressionAttributeValues = {
        ':state': state
      };
    }

    const result = await dynamodb.query(params).promise();
    const total = await dynamodb.scan({
      TableName: process.env.EVENTS_TABLE,
      Select: 'COUNT'
    }).promise();

    return {
      statusCode: 200,
      body: JSON.stringify({
        events: result.Items,
        currentPage: parseInt(page),
        totalPages: Math.ceil(total.Count / limit),
        total: total.Count
      })
    };
  } catch (error) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Failed to fetch events' })
    };
  }
};