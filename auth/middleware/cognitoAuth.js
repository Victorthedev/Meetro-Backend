const { CognitoJwtVerifier } = require('aws-jwt-verify');
const dynamodb = new AWS.DynamoDB.DocumentClient();

const verifier = CognitoJwtVerifier.create({
  userPoolId: process.env.COGNITO_USER_POOL_ID,
  tokenUse: "id",
  clientId: process.env.COGNITO_CLIENT_ID,
});

exports.handler = async (event) => {
  try {
    const token = event.headers.Authorization?.split(' ')[1];
    if (!token) throw new Error('No token provided');

    const payload = await verifier.verify(token);
    const user = await dynamodb.get({
      TableName: process.env.USERS_TABLE,
      Key: { email: payload.email }
    }).promise();
    
    if (!user.Item) throw new Error('User not found');

    return {
      principalId: user.Item.id,
      policyDocument: {
        Version: '2012-10-17',
        Statement: [{
          Action: 'execute-api:Invoke',
          Effect: 'Allow',
          Resource: event.methodArn
        }]
      },
      context: {
        userId: user.Item.id,
        email: user.Item.email
      }
    };
  } catch (error) {
    console.error('Auth error:', error);
    throw new Error('Unauthorized');
  }
};