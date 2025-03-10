const mongoose = require('mongoose');

const shareSchema = new mongoose.Schema({
  event: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event',
    required: true
  },
  sharedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  sharedWith: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    email: String,
    status: {
      type: String,
      enum: ['pending', 'accepted', 'declined'],
      default: 'pending'
    },
    responseDate: Date
  }],
  shareDate: {
    type: Date,
    default: Date.now
  }
});

const Share = mongoose.model('Share', shareSchema);

module.exports = Share;