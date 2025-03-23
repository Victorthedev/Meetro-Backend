const Event = require('../models/Event');
const { scraperQueue } = require('../config/bull');
const CalendarService = require('../services/CalenderService');

class EventController {
  async getEvents(req, res) {
    try {
      const { state, page = 1, limit = 10 } = req.query;
      
      const query = state ? { 'location.state': state } : {};
      
      const events = await Event.find(query)
        .sort({ startDate: 1 })
        .skip((page - 1) * limit)
        .limit(limit);

      const total = await Event.countDocuments(query);

      res.json({
        events,
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        total
      });
    } catch (error) {
      res.status(400).json({ error: 'Failed to fetch events' });
    }
  }

  async getEvent(req, res) {
    try {
      const event = await Event.findById(req.params.id);
      
      if (!event) {
        return res.status(404).json({ error: 'Event not found' });
      }

      res.json(event);
    } catch (error) {
      res.status(400).json({ error: 'Failed to fetch event' });
    }
  }

  async addToCalendar(req, res) {
    try {
      const event = await Event.findById(req.params.id);
      
      if (!event) {
        return res.status(404).json({ error: 'Event not found' });
      }

      if (req.user.calendarType === 'google') {
        await CalendarService.addToGoogleCalendar(req.user, event);
      } else {
        await CalendarService.addToAppleCalendar(req.user, event);
      }

      await Event.findByIdAndUpdate(
        event._id,
        { $addToSet: { attendees: req.user._id } }
      );

      res.json({ message: 'Event added to calendar' });
    } catch (error) {
      res.status(400).json({ error: 'Failed to add event to calendar' });
    }
  }

  async triggerScraping(req, res) {
    try {
      await scraperQueue.add('scrapeEvents', {}, {
        repeat: {
          cron: '0 0 * * *' // Run daily at midnight
        }
      });

      res.json({ message: 'Scraping triggered' });
    } catch (error) {
      res.status(400).json({ error: 'Failed to trigger scraping' });
    }
  }
}

module.exports = new EventController();