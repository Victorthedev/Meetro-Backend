const QRCode = require('qrcode');
const { uploadToS3 } = require('./awsService');

class QRCodeService {
  async generateQRCode(data) {
    try {
      // Generate QR code as data URL
      const qrDataUrl = await QRCode.toDataURL(data, {
        errorCorrectionLevel: 'H',
        margin: 1,
        width: 300
      });

      // Convert data URL to buffer
      const buffer = Buffer.from(qrDataUrl.split(',')[1], 'base64');

      // Upload to S3
      const s3Url = await uploadToS3({
        buffer,
        mimetype: 'image/png',
        originalname: `qr-${Date.now()}.png`
      });

      return s3Url;
    } catch (error) {
      throw new Error('Failed to generate QR code');
    }
  }

  async verifyQRCode(qrData) {
    try {
      const purchase = await TicketPurchase.findById(qrData)
        .populate('ticket event buyer');

      if (!purchase) {
        throw new Error('Invalid ticket');
      }

      if (purchase.used) {
        throw new Error('Ticket already used');
      }

      if (purchase.paymentStatus !== 'completed') {
        throw new Error('Ticket payment not completed');
      }

      return purchase;
    } catch (error) {
      throw new Error('Failed to verify QR code');
    }
  }
}

module.exports = new QRCodeService();