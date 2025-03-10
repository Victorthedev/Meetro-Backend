const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  googleId: {
    type: String,
    unique: true,
    sparse: true
  },
  name: {
    type: String,
    required: true
  },
  state: {
    type: String,
    required: true
  },
  profilePicture: {
    type: String
  },
  calendarType: {
    type: String,
    enum: ['google', 'apple'],
    required: true
  },
  calendarToken: {
    type: String
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

userSchema.pre('save', async function(next) {
  if (this.isModified('password')) {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }
  next();
});

const User = mongoose.model('User', userSchema);

module.exports = User;