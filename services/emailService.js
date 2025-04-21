const AWS = require('aws-sdk');
const sqs = new AWS.SQS();
const ses = new AWS.SES();

class EmailService {
  async sendEventShare(share) {
    try {
      for (const recipient of share.sharedWith) {
        const emailParams = {
          MessageBody: JSON.stringify({
            type: 'eventShare',
            event: share.event,
            sharedBy: share.sharedBy,
            recipient: recipient.email,
            shareId: share.id
          }),
          QueueUrl: process.env.EMAIL_QUEUE_URL
        };
        await sqs.sendMessage(emailParams).promise();
      }
      return true;
    } catch (error) {
      console.error('Error sending event share:', error);
      throw new Error('Failed to send event share');
    }
  }

  async sendAttendanceConfirmation(share, attendee) {
    try {
      const params = {
        MessageBody: JSON.stringify({
          type: 'attendanceConfirmation',
          event: share.event,
          sharedBy: share.sharedBy,
          attendee
        }),
        QueueUrl: process.env.EMAIL_QUEUE_URL
      };
      await sqs.sendMessage(params).promise();
      return true;
    } catch (error) {
      console.error('Error sending attendance confirmation:', error);
      throw new Error('Failed to send attendance confirmation');
    }
  }

  async sendSESEmail(to, subject, html) {
    try {
      const params = {
        Destination: { ToAddresses: [to] },
        Message: {
          Body: { Html: { Data: html } },
          Subject: { Data: subject }
        },
        Source: process.env.SES_FROM_EMAIL
      };
      await ses.sendEmail(params).promise();
      return true;
    } catch (error) {
      console.error('SES send error:', error);
      throw new Error('Failed to send email via SES');
    }
  }
}

module.exports = new EmailService();