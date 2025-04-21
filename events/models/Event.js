const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();

class Event {
  static async create(eventData) {
    const params = {
      TableName: process.env.EVENTS_TABLE,
      Item: eventData
    };
    await dynamodb.put(params).promise();
    return eventData;
  }

  static async findById(id) {
    const params = {
      TableName: process.env.EVENTS_TABLE,
      Key: { id }
    };
    const result = await dynamodb.get(params).promise();
    return result.Item;
  }

  static async findByCreator(creatorId) {
    const params = {
      TableName: process.env.EVENTS_TABLE,
      IndexName: 'CreatorIndex',
      KeyConditionExpression: 'creator = :creator',
      ExpressionAttributeValues: {
        ':creator': creatorId
      }
    };
    const result = await dynamodb.query(params).promise();
    return result.Items;
  }

  static async findPublicEvents(state, category) {
    const params = {
      TableName: process.env.EVENTS_TABLE,
      IndexName: 'VisibilityIndex',
      KeyConditionExpression: 'visibility = :visibility AND startDate >= :now',
      ExpressionAttributeValues: {
        ':visibility': 'public',
        ':now': new Date().toISOString()
      }
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
    return result.Items;
  }

  static async addAttendee(eventId, userId) {
    const params = {
      TableName: process.env.EVENTS_TABLE,
      Key: { id: eventId },
      UpdateExpression: 'ADD attendees :user',
      ExpressionAttributeValues: {
        ':user': dynamodb.createSet([userId])
      }
    };
    await dynamodb.update(params).promise();
  }
}

module.exports = Event;