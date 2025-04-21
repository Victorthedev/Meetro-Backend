const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();

class Ticket {
  static async create(ticketData) {
    const params = {
      TableName: process.env.TICKETS_TABLE,
      Item: ticketData
    };
    await dynamodb.put(params).promise();
    return ticketData;
  }

  static async findById(id) {
    const params = {
      TableName: process.env.TICKETS_TABLE,
      Key: { id }
    };
    const result = await dynamodb.get(params).promise();
    return result.Item;
  }

  static async findByEvent(eventId) {
    const params = {
      TableName: process.env.TICKETS_TABLE,
      IndexName: 'EventIndex',
      KeyConditionExpression: 'eventId = :eventId',
      ExpressionAttributeValues: {
        ':eventId': eventId
      }
    };
    const result = await dynamodb.query(params).promise();
    return result.Items;
  }

  static async incrementSold(ticketId, quantity) {
    const params = {
      TableName: process.env.TICKETS_TABLE,
      Key: { id: ticketId },
      UpdateExpression: 'SET quantitySold = quantitySold + :qty',
      ExpressionAttributeValues: {
        ':qty': quantity
      }
    };
    await dynamodb.update(params).promise();
  }
}

module.exports = Ticket;