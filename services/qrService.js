const QRCode = require('qrcode');
const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

class QRService {
  constructor() {
    this.s3 = new AWS.S3({
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      region: process.env.AWS_REGION
    });
  }

  async generateQRCode(data) {
    try {
      const qrDataUrl = await QRCode.toDataURL(data, {
        errorCorrectionLevel: 'H',
        margin: 1,
        width: 300
      });

      const buffer = Buffer.from(qrDataUrl.split(',')[1], 'base64');
      const key = `qrcodes/${uuidv4()}.png`;

      const result = await this.s3.upload({
        Bucket: process.env.STORAGE_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: 'image/png',
        ACL: 'public-read'
      }).promise();

      return result.Location;
    } catch (error) {
      console.error('QR generation error:', error);
      throw new Error('Failed to generate QR code');
    }
  }

  async verifyQRCode(qrData) {
    try {
      const purchase = await dynamodb.get({
        TableName: process.env.PURCHASES_TABLE,
        Key: { id: qrData }
      }).promise();

      if (!purchase.Item) {
        throw new Error('Invalid ticket');
      }

      if (purchase.Item.used) {
        throw new Error('Ticket already used');
      }

      if (purchase.Item.paymentStatus !== 'completed') {
        throw new Error('Ticket payment not completed');
      }

      return purchase.Item;
    } catch (error) {
      console.error('QR verification error:', error);
      throw new Error('Failed to verify QR code');
    }
  }
}

module.exports = new QRService();