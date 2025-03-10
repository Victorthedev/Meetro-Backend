const express = require('express');
const EventController = require('../controllers/eventController');
const { protect } = require('../middlewares/auth');

const router = express.Router();

router.get('/', protect, EventController.getEvents);
router.get('/:id', protect, EventController.getEvent);
router.post('/:id/calendar', protect, EventController.addToCalendar);
// router.post('/trigger-scraping', protect, EventController.triggerScraping);

module.exports = router;