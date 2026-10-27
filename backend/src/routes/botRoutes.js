const express = require('express');
const router = express.Router();

// ইন-মেমোরি স্টোরেজ (ভবিষ্যতে ডাটাবেজ সেভ করার ইন্টারফেস)
let connectedPages = [];
let botFlows = [];
let liveMessages = [];

// ১. মেটা ওয়েবহুক ভেরিফিকেশন (Meta Webhook Verification Endpoint)
router.get('/webhook', (req, res) => {
    const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'flowbot_secret_token';
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token) {
        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
            console.log('WEBHOOK_VERIFIED');
            return res.status(200).send(challenge);
        } else {
            return res.sendStatus(403);
        }
    }
    res.sendStatus(400);
});

// ২. মেটা ফেসবুক পেজ থেকে রিয়েল-টাইম মেসেজ রিসিভ করা (Receive Real-time Messages)
router.post('/webhook', (req, res) => {
    const body = req.body;

    if (body.object === 'page') {
        body.entry.forEach(entry => {
            const webhookEvent = entry.messaging[0];
            console.log('Received Webhook Event:', webhookEvent);

            const senderPsid = webhookEvent.sender.id;
            if (webhookEvent.message) {
                const incomingText = webhookEvent.message.text;

                // ইন-মেমোরি মেসেজ লিস্টে সেভ (ভবিষ্যতে Database Model.create() বসবে)
                liveMessages.push({
                    senderId: senderPsid,
                    text: incomingText,
                    timestamp: new Date().toISOString()
                });
            }
        });
        return res.status(200).send('EVENT_RECEIVED');
    } else {
        return res.sendStatus(404);
    }
});

// ৩. ফ্রন্টএন্ডে পাঠানোর জন্য হেলপার এপিআইসমূহ
router.get('/messages', (req, res) => {
    res.json({ success: true, messages: liveMessages });
});

module.exports = router;
