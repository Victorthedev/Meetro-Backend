const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();

class TicketPurchase {
  static async create(purchaseData) {
    const params = {
      TableName: process.env.PURCHASES_TABLE,
      Item: purchaseData
    };
    await dynamodb.put(params).promise();
    return purchaseData;
  }

  static async findById(id) {
    const params = {
      TableName: process.env.PURCHASES_TABLE,
      Key: { id }
    };
    const result = await dynamodb.get(params).promise();
    return result.Item;
  }

  static async findByEvent(eventId) {
    const params = {
      TableName: process.env.PURCHASES_TABLE,
      IndexName: 'EventIndex',
      KeyConditionExpression: 'eventId = :eventId',
      ExpressionAttributeValues: {
        ':eventId': eventId
      }
    };
    const result = await dynamodb.query(params).promise();
    return result.Items;
  }

  static async updateStatus(id, status) {
    const params = {
      TableName: process.env.PURCHASES_TABLE,
      Key: { id },
      UpdateExpression: 'SET paymentStatus = :status',
      ExpressionAttributeValues: {
        ':status': status
      }
    };
    await dynamodb.update(params).promise();
  }
}

module.exports = TicketPurchase;