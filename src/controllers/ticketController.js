const Ticket = require('../models/Tickets');
const TicketPurchase = require('../models/TicketPurchase');
const { initializePayment, verifyPayment } = require('../services/paystackService');
const { generateQRCode } = require('../services/qrService');
const { sendTicketEmail } = require('../services/ticketEmailService');

class TicketController {
  async createTicket(req, res) {
    try {
      const {
        eventId,
        name,
        type,
        price,
        quantity,
        bankDetails
      } = req.body;

      const ticket = await Ticket.create({
        event: eventId,
        name,
        type,
        price,
        quantity,
        bankDetails: price > 0 ? bankDetails : undefined
      });

      res.status(201).json(ticket);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  async purchaseTicket(req, res) {
    try {
      const {
        ticketId,
        quantity,
        recipientEmail
      } = req.body;

      const ticket = await Ticket.findById(ticketId);
      
      if (!ticket) {
        return res.status(404).json({ error: 'Ticket not found' });
      }

      if (ticket.quantitySold + quantity > ticket.quantity) {
        return res.status(400).json({ error: 'Not enough tickets available' });
      }

      const totalAmount = (ticket.price * quantity) + 500; // Adding platform fee

      const purchase = await TicketPurchase.create({
        ticket: ticketId,
        event: ticket.event,
        buyer: req.user._id,
        quantity,
        unitPrice: ticket.price,
        totalAmount,
        recipientEmail: recipientEmail || req.user.email
      });

      const payment = await initializePayment({
        email: req.user.email,
        amount: totalAmount * 100, // Paystack expects amount in kobo
        reference: purchase._id.toString(),
        metadata: {
          purchaseId: purchase._id
        }
      });

      res.json({ authorization_url: payment.authorization_url });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  async verifyPurchase(req, res) {
    try {
      const { reference } = req.query;
      
      const purchase = await TicketPurchase.findById(reference);
      if (!purchase) {
        return res.status(404).json({ error: 'Purchase not found' });
      }

      const verification = await verifyPayment(reference);
      
      if (verification.status === 'success') {
        purchase.paymentStatus = 'completed';
        purchase.paymentReference = reference;
        purchase.qrCode = await generateQRCode(purchase._id.toString());
        await purchase.save();

        const ticket = await Ticket.findById(purchase.ticket);
        ticket.quantitySold += purchase.quantity;
        await ticket.save();

        await sendTicketEmail(purchase);

        res.json({ status: 'success', purchase });
      } else {
        purchase.paymentStatus = 'failed';
        await purchase.save();
        res.status(400).json({ error: 'Payment verification failed' });
      }
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  async getTicketSales(req, res) {
    try {
      const { eventId } = req.params;
      
      const tickets = await Ticket.find({ event: eventId });
      const purchases = await TicketPurchase.find({
        event: eventId,
        paymentStatus: 'completed'
      });

      const totalSales = purchases.reduce((sum, p) => sum + p.totalAmount, 0);
      const platformFees = purchases.reduce((sum, p) => sum + p.platformFee, 0);

      res.json({
        tickets,
        totalSales,
        platformFees,
        netAmount: totalSales - platformFees
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }
}

module.exports = new TicketController();