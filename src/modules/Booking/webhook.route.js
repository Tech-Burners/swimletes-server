const express = require('express');
const router = express.Router();
const { stripeWebhookController } = require('./booking.controller');

// Support all common webhook paths & spelling variations (/weebhook, /webhook, /stripe)
router.post('/webhook', stripeWebhookController);
router.post('/weebhook', stripeWebhookController);
router.post('/stripe', stripeWebhookController);
router.post('/stripe/webhook', stripeWebhookController);
router.post('/stripe/weebhook', stripeWebhookController);
router.post('/', stripeWebhookController);

// GET handlers for easy verification in browser / health checks
router.get(['/', '/webhook', '/weebhook', '/stripe'], (req, res) => {
  res.status(200).json({ status: 'OK', message: 'Stripe webhook receiver is active' });
});

module.exports = router;
