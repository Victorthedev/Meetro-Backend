const { google } = require('googleapis');
const axios = require('axios');

class MeetingService {
  constructor() {
    this.googleAuth = new google.auth.JWT(
      process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      null,
      process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      ['https://www.googleapis.com/auth/calendar'],
      null
    );
  }

  async createMeetingLink(platform, eventName) {
    switch (platform) {
      case 'google_meet':
        return this.createGoogleMeet(eventName);
      case 'zoom':
        return this.createZoomMeeting(eventName);
      default:
        throw new Error('Unsupported platform');
    }
  }

  async createGoogleMeet(eventName) {
    try {
      await this.googleAuth.authorize();
      const calendar = google.calendar({ version: 'v3', auth: this.googleAuth });
      
      const event = {
        summary: eventName,
        conferenceData: {
          createRequest: {
            requestId: `${Date.now()}`,
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
      console.error('Google Meet creation error:', error);
      throw new Error('Failed to create Google Meet link');
    }
  }

  async createZoomMeeting(eventName) {
    try {
      const response = await axios.post(
        'https://api.zoom.us/v2/users/me/meetings',
        {
          topic: eventName,
          type: 2,
          duration: 60,
          settings: {
            host_video: true,
            participant_video: true,
            join_before_host: false
          }
        },
        {
          headers: {
            'Authorization': `Bearer ${process.env.ZOOM_JWT_TOKEN}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data.join_url;
    } catch (error) {
      console.error('Zoom meeting creation error:', error);
      throw new Error('Failed to create Zoom meeting');
    }
  }
}

module.exports = new MeetingService();