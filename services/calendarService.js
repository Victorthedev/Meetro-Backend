const { google } = require('googleapis');
const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();

class CalendarService {
  constructor() {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
  }

  async syncGoogleCalendar(user, token) {
    try {
      this.oauth2Client.setCredentials({ access_token: token });
      const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });

      const events = await dynamodb.query({
        TableName: process.env.EVENTS_TABLE,
        IndexName: 'CreatorIndex',
        KeyConditionExpression: 'creator = :creator',
        ExpressionAttributeValues: {
          ':creator': user.id
        }
      }).promise();

      for (const event of events.Items) {
        await this.addToGoogleCalendar(user, event);
      }

      return true;
    } catch (error) {
      console.error('Google Calendar sync error:', error);
      throw new Error('Failed to sync Google Calendar');
    }
  }

  async addToGoogleCalendar(user, event) {
    try {
      this.oauth2Client.setCredentials({ access_token: user.googleCalendarToken });
      const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });

      const eventDetails = {
        summary: event.name,
        description: event.description,
        start: {
          dateTime: event.startDate,
          timeZone: 'Africa/Lagos',
        },
        end: {
          dateTime: event.endDate,
          timeZone: 'Africa/Lagos',
        },
        location: event.location.type === 'offline' 
          ? event.location.address 
          : event.location.meetingLink,
      };

      await calendar.events.insert({
        calendarId: 'primary',
        resource: eventDetails,
      });

      return true;
    } catch (error) {
      console.error('Google Calendar add error:', error);
      throw new Error('Failed to add event to Google Calendar');
    }
  }

  async addToAppleCalendar(user, event) {
    try {
      // Apple Calendar integration would typically happen on the client side
      // This is a placeholder for server-side logic if needed
      return true;
    } catch (error) {
      console.error('Apple Calendar add error:', error);
      throw new Error('Failed to add event to Apple Calendar');
    }
  }
}

module.exports = new CalendarService();