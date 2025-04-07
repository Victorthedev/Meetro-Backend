const Event = require('../models/Event');
const { scraperQueue } = require('../config/bull');
const CalendarService = require('../services/CalenderService');
const { uploadToS3 } = require('../services/awsService');
const { createMeetingLink } = require('../services/meetingService');

class EventController {
  async createEvent(req, res) {
    try {
      const {
        name,
        description,
        visibility,
        eventType,
        startDate,
        endDate,
        locationType,
        state,
        address,
        onlinePlatform,
        category,
        coHosts,
        socialMediaLinks
      } = req.body;

      let location = {
        type: locationType
      };

      if (locationType === 'offline') {
        location.state = state;
        location.address = address;
      } else {
        const meetingLink = await createMeetingLink(onlinePlatform, name);
        location.onlinePlatform = onlinePlatform;
        location.meetingLink = meetingLink;
      }

      const posterImage = await uploadToS3(req.file);

      const event = await Event.create({
        name,
        description,
        creator: req.user._id,
        visibility,
        eventType,
        startDate,
        endDate,
        location,
        category,
        posterImage,
        coHosts,
        socialMediaLinks
      });

      res.status(201).json(event);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  async getEvent(req, res) {
    try {
      const event = await Event.findById(req.params.id)
        .populate('creator', 'name email')
        .populate('coHosts', 'name email');

      if (!event) {
        return res.status(404).json({ error: 'Event not found' });
      }

      res.json(event);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

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

  async getMyEvents(req, res) {
    try {
      const events = await Event.find({ creator: req.user._id })
        .sort({ startDate: -1 });

      res.json(events);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  async getPublicEvents(req, res) {
    try {
      const { state, category, page = 1, limit = 10 } = req.query;
      
      const query = {
        visibility: 'public',
        startDate: { $gte: new Date() }
      };

      if (state) query['location.state'] = state;
      if (category) query.category = category;

      const events = await Event.find(query)
        .sort({ startDate: 1 })
        .skip((page - 1) * limit)
        .limit(limit);

      res.json(events);
    } catch (error) {
      res.status(400).json({ error: error.message });
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