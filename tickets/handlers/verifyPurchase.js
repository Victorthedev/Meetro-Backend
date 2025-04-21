const dynamodb = new AWS.DynamoDB.DocumentClient();
const paystackService = require('../../services/paystackService');
const qrService = require('../../services/qrService');
const ticketEmailService = require('../../services/ticketEmailService');

exports.handler = async (event) => {
  try {
    const { reference } = event.queryStringParameters;
    
    const purchase = await dynamodb.get({
      TableName: process.env.PURCHASES_TABLE,
      Key: { id: reference }
    }).promise();

    if (!purchase.Item) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Purchase not found' })
      };
    }

    const verification = await paystackService.verifyPayment(reference);
    
    if (verification.status === 'success') {
      const [ticket, qrCode] = await Promise.all([
        dynamodb.get({
          TableName: process.env.TICKETS_TABLE,
          Key: { id: purchase.Item.ticketId }
        }).promise(),
        qrService.generateQRCode(purchase.Item.id)
      ]);

      await Promise.all([
        dynamodb.update({
          TableName: process.env.PURCHASES_TABLE,
          Key: { id: reference },
          UpdateExpression: 'SET paymentStatus = :status, paymentReference = :ref, qrCode = :qr',
          ExpressionAttributeValues: {
            ':status': 'completed',
            ':ref': reference,
            ':qr': qrCode
          }
        }).promise(),
        dynamodb.update({
          TableName: process.env.TICKETS_TABLE,
          Key: { id: purchase.Item.ticketId },
          UpdateExpression: 'SET quantitySold = quantitySold + :qty',
          ExpressionAttributeValues: {
            ':qty': purchase.Item.quantity
          }
        }).promise()
      ]);

      await ticketEmailService.sendTicketEmail({
        ...purchase.Item,
        qrCode,
        event: ticket.Item
      });

      return {
        statusCode: 200,
        body: JSON.stringify({ status: 'success', purchase: purchase.Item })
      };
    } else {
      await dynamodb.update({
        TableName: process.env.PURCHASES_TABLE,
        Key: { id: reference },
        UpdateExpression: 'SET paymentStatus = :status',
        ExpressionAttributeValues: {
          ':status': 'failed'
        }
      }).promise();
      
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Payment verification failed' })
      };
    }
  } catch (error) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: error.message })
    };
  }
};