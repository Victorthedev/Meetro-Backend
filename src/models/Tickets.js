const mongoose = require('mongoose');

const ticketSchema = new mongoose.Schema({
  event: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event',
    required: true
  },
  name: {
    type: String,
    required: true
  },
  type: {
    type: String,
    required: true
  },
  price: {
    type: Number,
    default: 0
  },
  quantity: {
    type: Number,
    required: true
  },
  quantitySold: {
    type: Number,
    default: 0
  },
  bankDetails: {
    accountName: String,
    bankName: String,
    accountNumber: String
  }
}, {
  timestamps: true
});

const Ticket = mongoose.model('Ticket', ticketSchema);
module.exports = Ticket;