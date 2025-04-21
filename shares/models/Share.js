const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();

class Share {
  static async create(shareData) {
    const params = {
      TableName: process.env.SHARES_TABLE,
      Item: shareData
    };
    await dynamodb.put(params).promise();
    return shareData;
  }

  static async findById(id) {
    const params = {
      TableName: process.env.SHARES_TABLE,
      Key: { id }
    };
    const result = await dynamodb.get(params).promise();
    return result.Item;
  }

  static async findBySharedBy(userId) {
    const params = {
      TableName: process.env.SHARES_TABLE,
      IndexName: 'SharedByIndex',
      KeyConditionExpression: 'sharedBy = :sharedBy',
      ExpressionAttributeValues: {
        ':sharedBy': userId
      }
    };
    const result = await dynamodb.query(params).promise();
    return result.Items;
  }

  static async updateResponse(shareId, email, response) {
    const params = {
      TableName: process.env.SHARES_TABLE,
      Key: { id: shareId },
      UpdateExpression: 'SET sharedWith[?].status = :status, sharedWith[?].responseDate = :date',
      ExpressionAttributeValues: {
        ':status': response,
        ':date': new Date().toISOString()
      },
      ConditionExpression: 'contains(sharedWith, :email)',
      ExpressionAttributeValues: {
        ':email': { email }
      }
    };
    await dynamodb.update(params).promise();
  }
}

module.exports = Share;