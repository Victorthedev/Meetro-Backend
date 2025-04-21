const dynamodb = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
  try {
    const userId = event.requestContext.authorizer.claims.sub;
    
    const user = await dynamodb.get({
      TableName: process.env.USERS_TABLE,
      Key: { id: userId }
    }).promise();

    if (!user.Item) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'User not found' })
      };
    }

    const { password, ...userData } = user.Item;

    return {
      statusCode: 200,
      body: JSON.stringify(userData)
    };
  } catch (error) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: error.message })
    };
  }
};