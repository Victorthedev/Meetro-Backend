const AWS = require('aws-sdk');
const ses = new AWS.SES();
const QRCode = require('qrcode');

class TicketEmailService {
  async sendTicketEmail(purchase) {
    try {
      const qrCodeDataUrl = await QRCode.toDataURL(purchase.id);

      const html = `
        <html>
          <body>
            <h1>Your Ticket for ${purchase.event.name}</h1>
            <p>Event Date: ${new Date(purchase.event.startDate).toLocaleString()}</p>
            <p>Location: ${purchase.event.location.address || purchase.event.location.meetingLink}</p>
            <p>Quantity: ${purchase.quantity}</p>
            <p>Total Paid: ₦${purchase.totalAmount.toLocaleString()}</p>
            <img src="${qrCodeDataUrl}" alt="QR Code" width="200" height="200"/>
            <p>Present this QR code at the event entrance</p>
          </body>
        </html>
      `;

      await ses.sendEmail({
        Destination: { ToAddresses: [purchase.recipientEmail] },
        Message: {
          Body: { Html: { Data: html } },
          Subject: { Data: `Your Ticket for ${purchase.event.name}` }
        },
        Source: process.env.SES_FROM_EMAIL
      }).promise();

      return true;
    } catch (error) {
      console.error('Ticket email error:', error);
      throw new Error('Failed to send ticket email');
    }
  }

  async sendEventReminder(purchase) {
    try {
      const html = `
        <html>
          <body>
            <h1>Reminder: ${purchase.event.name} is Tomorrow!</h1>
            <p>Event Time: ${new Date(purchase.event.startDate).toLocaleTimeString()}</p>
            ${purchase.event.location.meetingLink ? 
              `<p>Join Link: <a href="${purchase.event.location.meetingLink}">${purchase.event.location.meetingLink}</a></p>` : 
              `<p>Location: ${purchase.event.location.address}</p>`}
          </body>
        </html>
      `;

      await ses.sendEmail({
        Destination: { ToAddresses: [purchase.recipientEmail] },
        Message: {
          Body: { Html: { Data: html } },
          Subject: { Data: `Reminder: ${purchase.event.name} is Tomorrow!` }
        },
        Source: process.env.SES_FROM_EMAIL
      }).promise();

      return true;
    } catch (error) {
      console.error('Reminder email error:', error);
      throw new Error('Failed to send reminder email');
    }
  }
}

module.exports = new TicketEmailService();