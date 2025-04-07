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
  creator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  visibility: {
    type: String,
    enum: ['public', 'private'],
    required: true
  },
  eventType: {
    type: String,
    enum: ['single', 'recurring'],
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
    type: {
      type: String,
      enum: ['offline', 'online'],
      required: true
    },
    state: String,
    address: String,
    onlinePlatform: {
      type: String,
      enum: ['google_meet', 'zoom', 'teams', 'zoho']
    },
    meetingLink: String
  },
  category: {
    type: String,
    enum: [
      'Nightlife & Parties',
      'Music & Concerts',
      'Networking & Conferences',
      'Festivals & Cultural Events',
      'Sports & Fitness',
      'Food & Drink Events',
      'Tech & Innovation',
      'Community Meetups',
      'Art & Exhibitions',
      'Outdoor & Adventure',
      'Gaming & Esports',
      'Charity & Fundraisers'
    ],
    required: true
  },
  posterImage: {
    type: String,
    required: true
  },
  createdOnPlatform: {
    type: Boolean,
    default: true
  },
  source: {
    type: String,
    default: 'meetro'
  },
  coHosts: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  socialMediaLinks: {
    facebook: String,
    instagram: String,
    twitter: String,
    linkedin: String
  }
}, {
  timestamps: true
});

const Event = mongoose.model('Event', eventSchema);
module.exports = Event;