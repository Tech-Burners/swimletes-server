const express = require('express');
const router = express.Router();
const { auth } = require('../../middlewares/auth');
const { createReview, getInstructorReviews } = require('./review.controller');

// Mutual review endpoint: User reviews Instructor OR Instructor reviews User
router.post('/create', auth(['user', 'instructor']), createReview);
router.post('/', auth(['user', 'instructor']), createReview);

// Public / Client: Get instructor reviews with filters and distribution breakdown
router.get('/instructor/:instructorId', getInstructorReviews);
router.get('/:instructorId', getInstructorReviews);

module.exports = router;
