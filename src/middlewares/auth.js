const jwt = require('jsonwebtoken');
const { redisClient } = require('../config/redis');
const User = require('../models/User');

const protect = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization?.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({ error: 'Not authorized' });
    }

    const cached = await redisClient.get(`auth_${token}`);
    if (cached) {
      req.user = JSON.parse(cached);
      return next();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    await redisClient.setEx(`auth_${token}`, 3600, JSON.stringify(user));
    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Not authorized' });
  }
};

module.exports = { protect };