const mongoose = require('mongoose');

const ticketPurchaseSchema = new mongoose.Schema({
  ticket: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Ticket',
    required: true
  },
  event: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event',
    required: true
  },
  buyer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  quantity: {
    type: Number,
    required: true
  },
  unitPrice: {
    type: Number,
    required: true
  },
  platformFee: {
    type: Number,
    default: 500
  },
  totalAmount: {
    type: Number,
    required: true
  },
  recipientEmail: String,
  paymentStatus: {
    type: String,
    enum: ['pending', 'completed', 'failed'],
    default: 'pending'
  },
  paymentReference: String,
  qrCode: String,
  used: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

const TicketPurchase = mongoose.model('TicketPurchase', ticketPurchaseSchema);
module.exports = TicketPurchase;