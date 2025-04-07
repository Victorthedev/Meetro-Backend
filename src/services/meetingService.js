const { google } = require('googleapis');
const axios = require('axios');

class MeetingService {
  constructor() {
    this.googleAuth = new google.auth.JWT(
      process.env.GOOGLE_CLIENT_EMAIL,
      null,
      process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      ['https://www.googleapis.com/auth/calendar']
    );
  }

  async createMeetingLink(platform, eventName) {
    switch (platform) {
      case 'google_meet':
        return this.createGoogleMeet(eventName);
      case 'zoom':
        return this.createZoomMeeting(eventName);
      case 'teams':
        return this.createTeamsMeeting(eventName);
      case 'zoho':
        return this.createZohoMeeting(eventName);
      default:
        throw new Error('Unsupported platform');
    }
  }

  async createGoogleMeet(eventName) {
    try {
      const calendar = google.calendar({ version: 'v3', auth: this.googleAuth });
      
      const event = {
        summary: eventName,
        conferenceData: {
          createRequest: {
            requestId: `${Date.now()}-${Math.random().toString(36).substring(7)}`,
            conferenceSolutionKey: { type: 'hangoutsMeet' }
          }
        }
      };

      const response = await calendar.events.insert({
        calendarId: 'primary',
        resource: event,
        conferenceDataVersion: 1
      });

      return response.data.hangoutLink;
    } catch (error) {
      throw new Error('Failed to create Google Meet link');
    }
  }

  async createZoomMeeting(eventName) {
    try {
      const response = await axios.post('https://api.zoom.us/v2/users/me/meetings', {
        topic: eventName,
        type: 2 // Scheduled meeting
      }, {
        headers: {
          'Authorization': `Bearer ${process.env.ZOOM_JWT_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });

      return response.data.join_url;
    } catch (error) {
      throw new Error('Failed to create Zoom meeting');
    }
  }

  async createTeamsMeeting(eventName) {
    // Note to self: Teams implementation would require Microsoft Graph API
    throw new Error('Teams integration not implemented');
  }

  async createZohoMeeting(eventName) {
    // Note to self: Zoho implementation would require Zoho API
    throw new Error('Zoho integration not implemented');
  }
}

module.exports = new MeetingService();