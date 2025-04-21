const dynamodb = new AWS.DynamoDB.DocumentClient();
const paystackService = require('../../services/paystackService');
const { v4: uuidv4 } = require('uuid');

exports.handler = async (event) => {
  try {
    const { ticketId, quantity, recipientEmail } = JSON.parse(event.body);
    const userId = event.requestContext.authorizer.claims.sub;
    const userEmail = event.requestContext.authorizer.claims.email;

    const ticket = await dynamodb.get({
      TableName: process.env.TICKETS_TABLE,
      Key: { id: ticketId }
    }).promise();

    if (!ticket.Item) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Ticket not found' })
      };
    }

    if (ticket.Item.quantitySold + parseInt(quantity) > ticket.Item.quantity) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Not enough tickets available' })
      };
    }

    const totalAmount = (ticket.Item.price * parseInt(quantity)) + 500;
    const purchaseId = uuidv4();

    const purchase = {
      id: purchaseId,
      ticketId,
      eventId: ticket.Item.eventId,
      buyer: userId,
      quantity: parseInt(quantity),
      unitPrice: ticket.Item.price,
      platformFee: 500,
      totalAmount,
      recipientEmail: recipientEmail || userEmail,
      paymentStatus: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await dynamodb.put({
      TableName: process.env.PURCHASES_TABLE,
      Item: purchase
    }).promise();

    const payment = await paystackService.initializePayment({
      email: userEmail,
      amount: totalAmount * 100,
      reference: purchaseId,
      metadata: {
        purchaseId
      }
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ authorization_url: payment.authorization_url })
    };
  } catch (error) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: error.message })
    };
  }
};