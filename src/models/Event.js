const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  location: {
    address: String,
    city: String,
    state: {
      type: String,
      required: true
    },
    coordinates: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point'
      },
      coordinates: [Number]
    }
  },
  organizer: {
    name: String,
    contact: String
  },
  category: {
    type: String,
    required: true
  },
  source: {
    type: String,
    required: true
  },
  sourceId: {
    type: String,
    required: true
  },
  imageUrl: String,
  price: {
    amount: Number,
    currency: {
      type: String,
      default: 'NGN'
    }
  },
  attendees: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

eventSchema.index({ 'location.coordinates': '2dsphere' });
eventSchema.index({ sourceId: 1, source: 1 }, { unique: true });

const Event = mongoose.model('Event', eventSchema);

module.exports = Event;