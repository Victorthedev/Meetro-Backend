const sgMail = require('@sendgrid/mail');
const { emailQueue } = require('../config/bull');

class EmailService {
  constructor() {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  }

  async sendEventShare(share) {
    const { event, sharedBy, sharedWith } = share;

    for (const recipient of sharedWith) {
      await emailQueue.add('shareEvent', {
        to: recipient.email,
        subject: `${sharedBy.name} shared an event with you: ${event.name}`,
        html: this.getShareEmailTemplate(event, sharedBy, recipient),
      });
    }
  }

  async sendAttendanceConfirmation(share, attendee) {
    await emailQueue.add('confirmAttendance', {
      to: share.sharedBy.email,
      subject: `${attendee.name} is attending ${share.event.name}`,
      html: this.getConfirmationEmailTemplate(share.event, attendee),
    });
  }

  getShareEmailTemplate(event, sharedBy, recipient) {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>${event.name}</h2>
        <p>${sharedBy.name} has shared an event with you!</p>
        <p>Date: ${event.startDate.toLocaleDateString()}</p>
        <p>Location: ${event.location.address}</p>
        <p>Description: ${event.description}</p>
        <div style="margin: 20px 0;">
          <a href="${process.env.FRONTEND_URL}/events/confirm/${recipient._id}" 
             style="background: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
            Confirm Attendance
          </a>
        </div>
      </div>
    `;
  }

  getConfirmationEmailTemplate(event, attendee) {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Attendance Confirmation</h2>
        <p>${attendee.name} has confirmed their attendance to ${event.name}!</p>
        <p>Event Details:</p>
        <p>Date: ${event.startDate.toLocaleDateString()}</p>
        <p>Location: ${event.location.address}</p>
      </div>
    `;
  }
}

module.exports = new EmailService();