const sgMail = require('@sendgrid/mail');
const QRCode = require('qrcode');
const { emailQueue } = require('../config/bull');

class TicketEmailService {
  constructor() {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  }

  async sendTicketEmail(purchase) {
    try {
      const qrCodeDataUrl = await QRCode.toDataURL(purchase._id.toString());
      
      const emailData = {
        to: purchase.recipientEmail,
        from: 'noreply@meetro.com',
        subject: `Your Tickets for ${purchase.event.name}`,
        templateId: 'd-xxx', // SendGrid template ID
        dynamic_template_data: {
          eventName: purchase.event.name,
          eventDate: purchase.event.startDate,
          eventLocation: purchase.event.location,
          ticketType: purchase.ticket.type,
          quantity: purchase.quantity,
          totalAmount: purchase.totalAmount,
          qrCode: qrCodeDataUrl,
          purchaseId: purchase._id
        }
      };

      await emailQueue.add('sendTicket', emailData);
    } catch (error) {
      throw new Error('Failed to send ticket email');
    }
  }

  async sendEventReminder(purchase) {
    try {
      const emailData = {
        to: purchase.recipientEmail,
        from: 'noreply@meetro.com',
        subject: `Reminder: ${purchase.event.name} is Tomorrow!`,
        templateId: 'd-yyy', // SendGrid template ID
        dynamic_template_data: {
          eventName: purchase.event.name,
          eventDate: purchase.event.startDate,
          eventLocation: purchase.event.location,
          meetingLink: purchase.event.location.meetingLink
        }
      };

      await emailQueue.add('sendReminder', emailData);
    } catch (error) {
      throw new Error('Failed to send reminder email');
    }
  }
}

module.exports = new TicketEmailService();