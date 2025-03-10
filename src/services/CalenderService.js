const { google } = require('googleapis');
const axios = require('axios');

class CalendarService {
  constructor() {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
  }

  async addToGoogleCalendar(user, event) {
    try {
      this.oauth2Client.setCredentials({ access_token: user.calendarToken });
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
        location: event.location.address,
      };

      await calendar.events.insert({
        calendarId: 'primary',
        resource: eventDetails,
      });
    } catch (error) {
      throw new Error('Failed to add event to Google Calendar');
    }
  }

  async addToAppleCalendar(user, event) {
    try {
      const appleCalendarUrl = `https://p51-caldav.icloud.com/ical/${user.calendarToken}/calendars/primary`;
      
      const icsData = this.generateICSFormat(event);
      
      await axios.put(appleCalendarUrl, icsData, {
        headers: {
          'Content-Type': 'text/calendar; charset=utf-8',
        },
      });
    } catch (error) {
      throw new Error('Failed to add event to Apple Calendar');
    }
  }

  generateICSFormat(event) {
    return `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
SUMMARY:${event.name}
DESCRIPTION:${event.description}
LOCATION:${event.location.address}
DTSTART:${this.formatDate(event.startDate)}
DTEND:${this.formatDate(event.endDate)}
END:VEVENT
END:VCALENDAR`;
  }

  formatDate(date) {
    return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  }
}

module.exports = new CalendarService();