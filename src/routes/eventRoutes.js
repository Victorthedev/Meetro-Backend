const express = require('express');
const EventController = require('../controllers/eventController');
const { protect } = require('../middlewares/auth');
const TicketController = require('../controllers/ticketController');
const upload = require('../middlewares/upload');

const router = express.Router();

// Event routes
router.post('/', protect, upload.single('posterImage'), EventController.createEvent);
router.get('/public', EventController.getPublicEvents);
router.get('/my-events', protect, EventController.getMyEvents);
router.get('/', protect, EventController.getEvents);
router.get('/:id', protect, EventController.getEvent);
router.post('/:id/calendar', protect, EventController.addToCalendar);
// router.get('/:id', EventController.getEvent);

// Ticket routes
router.post('/:eventId/tickets', protect, TicketController.createTicket);
router.post('/tickets/purchase', protect, TicketController.purchaseTicket);
router.get('/tickets/verify', protect, TicketController.verifyPurchase);
router.get('/:eventId/sales', protect, TicketController.getTicketSales);


// router.post('/trigger-scraping', protect, EventController.triggerScraping);

module.exports = router;