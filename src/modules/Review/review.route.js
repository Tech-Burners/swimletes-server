const express = require('express');
const router = express.Router();
const { auth } = require('../../middlewares/auth');
const { createReview } = require('./review.controller');

// Mutual review endpoint: User reviews Instructor OR Instructor reviews User
router.post('/create', auth(['user', 'instructor']), createReview);
router.post('/', auth(['user', 'instructor']), createReview);

module.exports = router;
