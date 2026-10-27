const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');
const { requireAuth } = require('../middleware/auth');
const workspaceAccess = require('../middleware/workspaceAccess');
router.use(requireAuth, workspaceAccess);

router.get('/subscribers/:channelId', chatController.getSubscribers);
router.get('/messages/:subscriberId', chatController.getMessages);
router.post('/send', chatController.sendMessage);

module.exports = router;
