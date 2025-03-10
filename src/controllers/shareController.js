const Share = require('../models/Share');
const EmailService = require('../services/EmailService');

class ShareController {
  async shareEvent(req, res) {
    try {
      const { eventId, recipients } = req.body;

      const share = await Share.create({
        event: eventId,
        sharedBy: req.user._id,
        sharedWith: recipients.map(email => ({ email }))
      });

      await share.populate('event sharedBy');
      
      await EmailService.sendEventShare(share);

      res.json(share);
    } catch (error) {
      res.status(400).json({ error: 'Failed to share event' });
    }
  }

  async confirmAttendance(req, res) {
    try {
      const { shareId, response } = req.body;

      const share = await Share.findOne({
        _id: shareId,
        'sharedWith.email': req.user.email
      });

      if (!share) {
        return res.status(404).json({ error: 'Share not found' });
      }

      const recipientIndex = share.sharedWith.findIndex(
        r => r.email === req.user.email
      );

      share.sharedWith[recipientIndex].status = response;
      share.sharedWith[recipientIndex].responseDate = new Date();

      await share.save();
      await share.populate('event sharedBy');

      if (response === 'accepted') {
        await EmailService.sendAttendanceConfirmation(share, req.user);
      }

      res.json(share);
    } catch (error) {
      res.status(400).json({ error: 'Failed to confirm attendance' });
    }
  }

  async getShares(req, res) {
    try {
      const shares = await Share.find({
        $or: [
          { sharedBy: req.user._id },
          { 'sharedWith.email': req.user.email }
        ]
      }).populate('event sharedBy');

      res.json(shares);
    } catch (error) {
      res.status(400).json({ error: 'Failed to fetch shares' });
    }
  }
}

module.exports = new ShareController();