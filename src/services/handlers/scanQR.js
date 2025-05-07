const { getItem } = require('../../utils/db');
const { TABLE_NAMES } = require('../../utils/constants');
const logger = require('../../utils/logger');
const QRCode = require('qrcode-reader');

exports.handler = async (event) => {
  try {
    const { qrCodeImage } = JSON.parse(event.body || '{}'); // Base64 encoded image
    if (!qrCodeImage) {
      logger.error('Missing qrCodeImage');
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing qrCodeImage' }),
      };
    }

    const qr = new QRCode();
    const buffer = Buffer.from(qrCodeImage, 'base64');
    const result = await new Promise((resolve, reject) => {
      qr.callback = (err, value) => (err ? reject(err) : resolve(value));
      qr.decode(buffer);
    });

    const purchaseId = result.result; // QR code contains purchaseId
    const purchase = await getItem(TABLE_NAMES.PURCHASES, { id: { S: purchaseId } });

    if (!purchase || purchase.status !== 'completed') {
      logger.error('Purchase not found or not completed', { purchaseId });
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Purchase not found or not completed' }),
      };
    }

    const ticket = await getItem(TABLE_NAMES.TICKETS, { id: { S: purchase.ticketId } });
    const event = await getItem(TABLE_NAMES.EVENTS, { id: { S: purchase.eventId } });

    logger.info('QR code scanned', { purchaseId, ticketId: purchase.ticketId, eventId: purchase.eventId });
    return {
      statusCode: 200,
      body: JSON.stringify({
        purchaseId,
        ticketId: purchase.ticketId,
        event: { title: event.title, date: event.date },
        quantity: purchase.quantity,
        message: 'QR code scanned successfully',
      }),
    };
  } catch (error) {
    logger.error('Scan QR error', { error: error.message, stack: error.stack });
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};