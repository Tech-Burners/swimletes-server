const express = require('express');
const router = express.Router();
const { auth } = require('../../middlewares/auth');
const {
  createBooking,
  getMyBookings,
  getBookingTabCounts,
  getBookingDetails,
  acceptBooking,
  declineBooking,
  startBooking,
  completeBooking,
  cancelBooking,
  rebookLesson,
  updateBookingStatus,
  sendBookingReminder,
  getAdminBookingsListController,
  getAdminBookingDetailsController,
  adminUpdateBookingStatusController
} = require('./booking.controller');

// 1. Admin Bookings Endpoints (Figma 40012554:17793 & 40012554:18447)
router.get('/admin/bookings', auth(['admin']), getAdminBookingsListController);
router.post('/admin/bookings', auth(['admin']), createBooking);
router.get('/admin/bookings/:id', auth(['admin']), getAdminBookingDetailsController);
router.patch('/admin/bookings/:id/status', auth(['admin']), adminUpdateBookingStatusController);
router.get('/admin/:id', auth(['admin']), getAdminBookingDetailsController);

// 2. Booking Creation (User & Admin)
router.post('/create', auth(['user', 'admin']), createBooking);
router.post('/', auth(['user', 'admin']), createBooking);

// 3. Listing & Tab Badges (User & Instructor)
router.get('/my-bookings', auth(['user', 'instructor', 'admin']), getMyBookings);
router.get('/tab-counts', auth(['user', 'instructor', 'admin']), getBookingTabCounts);

// 4. Rebook / Book Again helper (User)
router.get('/:id/rebook', auth(['user']), rebookLesson);

// 5. Instructor Action Endpoints
router.patch('/:id/accept', auth(['instructor', 'admin']), acceptBooking);
router.patch('/:id/decline', auth(['instructor', 'admin']), declineBooking);
router.patch('/:id/start', auth(['instructor', 'admin']), startBooking);
router.patch('/:id/complete', auth(['instructor', 'admin']), completeBooking);
router.post('/:id/remind', auth(['instructor', 'admin']), sendBookingReminder);
router.post('/:id/send-reminder', auth(['instructor', 'admin']), sendBookingReminder);

// 6. Cancellation (User or Instructor)
router.patch('/:id/cancel', auth(['user', 'instructor', 'admin']), cancelBooking);

// 7. Generic Status Update (backward compatibility)
router.patch('/status/:id', auth(['user', 'instructor', 'admin']), updateBookingStatus);
router.patch('/:id/status', auth(['user', 'instructor', 'admin']), updateBookingStatus);

// 8. Booking Details by ID
router.get('/:id', auth(['user', 'instructor', 'admin']), getBookingDetails);

module.exports = router;

