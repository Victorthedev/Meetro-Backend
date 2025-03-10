const express = require('express');
const AuthController = require('../controllers/authController');
const { protect } = require('../middlewares/auth');

const router = express.Router();

router.post('/google-login', AuthController.googleLogin);
router.get('/me', protect, AuthController.getMe);
router.put('/profile', protect, AuthController.updateProfile);

module.exports = router;