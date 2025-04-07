const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

class AuthController {
  async googleLogin(req, res) {
    try {
      const { token, state, calendarType } = req.body;

      const ticket = await googleClient.verifyIdToken({
        idToken: req.body.id_token || token, 
        audience: process.env.GOOGLE_CLIENT_ID
      });
      
      const payload = ticket.getPayload();
      const { email, name, picture, sub: googleId } = payload;

      let user = await User.findOne({ email });
      
      if (!user) {
        user = await User.create({
          email,
          name: name || email.split('@')[0], 
          googleId,
          profilePicture: picture,
          state,
          calendarType
        });
      } else {

        if (state || calendarType) {
          user.state = state || user.state;
          user.calendarType = calendarType || user.calendarType;
          await user.save();
        }
      }

      const jwtToken = jwt.sign(
        { id: user._id },
        process.env.JWT_SECRET,
        { expiresIn: '30d' }
      );

      res.json({
        token: jwtToken,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          state: user.state,
          profilePicture: user.profilePicture,
          calendarType: user.calendarType
        }
      });
    } catch (error) {
      console.error('Google Auth Error:', error);
      res.status(400).json({ error: 'Invalid token', details: error.message });
    }
  }  async googleLogin(req, res) {
    try {
      const { token, state, calendarType } = req.body;
      
      const ticket = await googleClient.verifyIdToken({
        idToken: req.body.id_token || token,
        audience: process.env.GOOGLE_CLIENT_ID
      });
      
      const payload = ticket.getPayload();
      const { email, name, picture, sub: googleId } = payload;

      let user = await User.findOne({ email });
      
      if (!user) {
        user = await User.create({
          email,
          name: name || email.split('@')[0],
          googleId,
          profilePicture: picture,
          state,
          calendarType
        });
      } else {

        if (state || calendarType) {
          user.state = state || user.state;
          user.calendarType = calendarType || user.calendarType;
          await user.save();
        }
      }

      const jwtToken = jwt.sign(
        { id: user._id },
        process.env.JWT_SECRET,
        { expiresIn: '30d' }
      );

      res.json({
        token: jwtToken,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          state: user.state,
          profilePicture: user.profilePicture,
          calendarType: user.calendarType
        }
      });
    } catch (error) {
      console.error('Google Auth Error:', error);
      res.status(400).json({ error: 'Invalid token', details: error.message });
    }
  }

  async getMe(req, res) {
    try {
      const user = await User.findById(req.user._id);
      res.json(user);
    } catch (error) {
      res.status(400).json({ error: 'User not found' });
    }
  }

  async updateProfile(req, res) {
    try {
      const { state, calendarType } = req.body;
      
      const user = await User.findByIdAndUpdate(
        req.user._id,
        { state, calendarType },
        { new: true }
      );

      res.json(user);
    } catch (error) {
      res.status(400).json({ error: 'Failed to update profile' });
    }
  }
}

module.exports = new AuthController();