const express = require('express');
const ShareController = require('../controllers/shareController');
const { protect } = require('../middlewares/auth');

const router = express.Router();

router.post('/', protect, ShareController.shareEvent);
router.post('/confirm', protect, ShareController.confirmAttendance);
router.get('/', protect, ShareController.getShares);

module.exports = router;