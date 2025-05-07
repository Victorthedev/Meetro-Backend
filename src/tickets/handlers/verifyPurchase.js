const { queryItems, updateItem, getItem } = require('../../utils/db');
const { TABLE_NAMES, BUCKET_NAME, API_KEYS } = require('../../utils/constants');
const axios = require('axios');
const logger = require('../../utils/logger');
const QRCode = require('qrcode');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const s3Client = new S3Client({ region: process.env.AWS_REGION });

exports.handler = async (event) => {
  try {
    const { reference } = event.queryStringParameters || {};
    if (!reference) {
      logger.error('Missing reference');
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing reference' }),
      };
    }

    const purchases = await queryItems(TABLE_NAMES.PURCHASES, {
      IndexName: 'byPaymentReference',
      KeyConditionExpression: 'paymentReference = :reference',
      ExpressionAttributeValues: { ':reference': reference },
    });

    if (!purchases || purchases.length === 0) {
      logger.error('Purchase not found', { reference });
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Purchase not found' }),
      };
    }

    const purchase = purchases[0];
    const paystackResponse = await axios.get(`https://api.paystack.co/transaction/verify/${reference}`, {
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
    });

    if (paystackResponse.data.data.status === 'success') {
      // Update purchase status
      await updateItem(TABLE_NAMES.PURCHASES, { id: { S: purchase.id } }, 'SET #status = :status', {
        ':status': { S: 'completed' },
      }, { '#status': 'status' });

      // Generate QR code
      const qrCodeData = purchase.id; // QR code contains the purchaseId
      const qrCodeUrl = await QRCode.toDataURL(qrCodeData);
      const qrCodeBuffer = Buffer.from(qrCodeUrl.split(',')[1], 'base64');

      // Upload QR code to S3
      const qrCodeKey = `qrcodes/${purchase.id}.png`;
      await s3Client.send(new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: qrCodeKey,
        Body: qrCodeBuffer,
        ContentType: 'image/png',
      }));

      const qrCodeS3Url = `https://${BUCKET_NAME}.s3.amazonaws.com/${qrCodeKey}`;

      // Fetch ticket and event details for email
      const ticket = await getItem(TABLE_NAMES.TICKETS, { id: { S: purchase.ticketId } });
      const event = await getItem(TABLE_NAMES.EVENTS, { id: { S: purchase.eventId } });
      const user = await getItem(TABLE_NAMES.USERS, { userId: { S: purchase.userId } });

      // Send email to user
      const emailResponse = await axios.post(
        'https://api.resend.com/emails',
        {
          from: API_KEYS.RESEND_FROM_EMAIL,
          to: user.email.S,
          subject: 'Your Ticket Purchase Confirmation',
          html: `
            <h1>Ticket Purchase Confirmed</h1>
            <p>Thank you for your purchase!</p>
            <p><strong>Event:</strong> ${event.title}</p>
            <p><strong>Ticket ID:</strong> ${purchase.ticketId}</p>
            <p><strong>Quantity:</strong> ${purchase.quantity}</p>
            <p><strong>Amount:</strong> NGN ${purchase.amount}</p>
            <p><strong>QR Code:</strong> <a href="${qrCodeS3Url}">View your QR Code</a></p>
            <p>Please present this QR code at the event for entry.</p>
          `,
        },
        {
          headers: { Authorization: `Bearer ${API_KEYS.RESEND_API_KEY}` },
        }
      );

      logger.info('Purchase verified, QR code generated, and email sent', { reference, purchaseId: purchase.id, emailResponse: emailResponse.data });
      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'Purchase verified', purchase, qrCodeUrl: qrCodeS3Url }),
      };
    }

    logger.error('Payment verification failed', { reference });
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Payment verification failed' }),
    };
  } catch (error) {
    logger.error('Verify purchase error', { error: error.message, stack: error.stack });
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};