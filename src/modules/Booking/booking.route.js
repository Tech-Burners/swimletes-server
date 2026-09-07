const express = require('express');
const router = express.Router();
const { auth } = require('../../middlewares/auth');
const {
  createBooking,
  getMyBookings,
  getBookingDetails,
  updateBookingStatus
} = require('./booking.controller');

// User creates a booking
router.post('/create', auth(['user']), createBooking);
router.post('/', auth(['user']), createBooking);

// Get my bookings (Client or Instructor)
router.get('/my-bookings', auth(['user', 'instructor']), getMyBookings);

// Update booking status (accept, decline, complete, cancel)
router.patch('/status/:id', auth(['user', 'instructor', 'admin']), updateBookingStatus);
router.patch('/:id/status', auth(['user', 'instructor', 'admin']), updateBookingStatus);

// Get specific booking details
router.get('/:id', auth(['user', 'instructor', 'admin']), getBookingDetails);

module.exports = router;
