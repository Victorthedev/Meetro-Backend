const { OAuth2Client } = require('google-auth-library');
const dynamodb = new AWS.DynamoDB.DocumentClient();
const calendarService = require('../../services/calendarService');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

exports.handler = async (event) => {
  try {
    const { token } = JSON.parse(event.body);
    const userId = event.requestContext.authorizer.claims.sub;

    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID
    });
    const { email, sub: googleId } = ticket.getPayload();

    await dynamodb.update({
      TableName: process.env.USERS_TABLE,
      Key: { id: userId },
      UpdateExpression: 'SET calendarType = :type, googleId = :googleId, googleCalendarToken = :token',
      ExpressionAttributeValues: {
        ':type': 'google',
        ':googleId': googleId,
        ':token': token
      }
    }).promise();

    const user = await dynamodb.get({
      TableName: process.env.USERS_TABLE,
      Key: { id: userId }
    }).promise();

    await calendarService.syncGoogleCalendar(user.Item, token);

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true })
    };
  } catch (error) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: error.message })
    };
  }
};