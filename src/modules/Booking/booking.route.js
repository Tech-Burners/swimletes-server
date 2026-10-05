const express = require('express');
const router = express.Router();
const { auth } = require('../../middlewares/auth');
const {
  createBooking,
  getMyBookings,
  getBookingTabCounts,
  getBookingDetails,
  getBookingChat,
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
  adminUpdateBookingStatusController,
  createBookingPaymentIntent,
  confirmBookingPayment,
  createCheckoutSessionController,
  bookingPaymentSuccessController,
  bookingPaymentFailController,
  bookingPaymentCancelController,
  stripeWebhookController,
  getBookingReviewDetails,
  getBookingConfirmationDetails,
  checkBookingConflictController
} = require('./booking.controller');

// 1. Admin Bookings Endpoints (Figma 40012554:17793 & 40012554:18447)
router.get('/admin/bookings', auth(['admin']), getAdminBookingsListController);
router.post('/admin/bookings', auth(['admin']), createBooking);
router.get('/admin/bookings/:id', auth(['admin']), getAdminBookingDetailsController);
router.patch('/admin/bookings/:id/status', auth(['admin']), adminUpdateBookingStatusController);
router.get('/admin/:id', auth(['admin']), getAdminBookingDetailsController);

// Admin Refunds (Figma 40012554:21158)
const refundRoutes = require('./refund.route');
router.use('/admin/refunds', refundRoutes);

// Real-time Booking Conflict Check
router.get('/check-conflict', auth(['user', 'instructor', 'admin'], { optional: true }), checkBookingConflictController);
router.post('/check-conflict', auth(['user', 'instructor', 'admin'], { optional: true }), checkBookingConflictController);

// 2. Booking Creation (User & Admin)
router.post('/create', auth(['user', 'admin']), createBooking);
router.post('/', auth(['user', 'admin']), createBooking);

// Stripe Payment Success & Failure API Endpoints (GET & POST)
router.get('/payment/success', bookingPaymentSuccessController);
router.post('/payment/success', bookingPaymentSuccessController);
router.get('/payment-success', bookingPaymentSuccessController);
router.post('/payment-success', bookingPaymentSuccessController);
router.get('/payment/payment-success', bookingPaymentSuccessController);
router.post('/payment/payment-success', bookingPaymentSuccessController);

router.get('/payment/fail', bookingPaymentFailController);
router.post('/payment/fail', bookingPaymentFailController);
router.get('/payment/failed', bookingPaymentFailController);
router.post('/payment/failed', bookingPaymentFailController);
router.get('/payment-fail', bookingPaymentFailController);
router.post('/payment-fail', bookingPaymentFailController);
router.get('/payment/cancel', bookingPaymentCancelController);
router.post('/payment/cancel', bookingPaymentCancelController);
router.get('/payment-cancel', bookingPaymentCancelController);
router.post('/payment-cancel', bookingPaymentCancelController);

router.get('/success', bookingPaymentSuccessController);
router.post('/success', bookingPaymentSuccessController);
router.get('/fail', bookingPaymentFailController);
router.post('/fail', bookingPaymentFailController);
router.get('/cancel', bookingPaymentCancelController);
router.post('/cancel', bookingPaymentCancelController);

router.post('/create-checkout-session', auth(['user', 'admin']), createCheckoutSessionController);
router.post('/checkout-session', auth(['user', 'admin']), createCheckoutSessionController);
router.post('/checkout-link', auth(['user', 'admin']), createCheckoutSessionController);
router.post('/:id/checkout-link', auth(['user', 'admin']), createCheckoutSessionController);
router.post('/:id/checkout-session', auth(['user', 'admin']), createCheckoutSessionController);
router.post('/create-payment-intent', auth(['user', 'admin']), createBookingPaymentIntent);
router.post('/confirm-payment', auth(['user', 'admin']), confirmBookingPayment);
router.post('/:id/confirm-payment', auth(['user', 'admin']), confirmBookingPayment);
router.post('/webhook', stripeWebhookController);
router.post('/weebhook', stripeWebhookController);

// 3. Listing & Tab Badges (User & Instructor)
router.get('/my-bookings', auth(['user', 'instructor', 'admin']), getMyBookings);
router.get('/tab-counts', auth(['user', 'instructor', 'admin']), getBookingTabCounts);

// 4. Rebook / Book Again helper (User)
router.get('/:id/rebook', auth(['user']), rebookLesson);

// 5. Completion & Instructor Action Endpoints
router.patch('/:id/accept', auth(['instructor', 'admin']), acceptBooking);
router.patch('/:id/decline', auth(['instructor', 'admin']), declineBooking);
router.patch('/:id/start', auth(['instructor', 'admin']), startBooking);
router.patch('/:id/confirm', auth(['user', 'admin']), completeBooking);
router.post('/:id/confirm', auth(['user', 'admin']), completeBooking);
router.patch('/:id/complete', auth(['user', 'instructor', 'admin']), completeBooking);
router.post('/:id/complete', auth(['user', 'instructor', 'admin']), completeBooking);
router.post('/:id/remind', auth(['instructor', 'admin']), sendBookingReminder);
router.post('/:id/send-reminder', auth(['instructor', 'admin']), sendBookingReminder);

// 6. Cancellation (User or Instructor)
router.patch('/:id/cancel', auth(['user', 'instructor', 'admin']), cancelBooking);

// 7. Generic Status Update (backward compatibility)
router.patch('/status/:id', auth(['user', 'instructor', 'admin']), updateBookingStatus);
router.patch('/:id/status', auth(['user', 'instructor', 'admin']), updateBookingStatus);

// 8. Review & Pay and Booking Confirmed Screen Details (Figma 40012199:3518 & 40012199:3699)
router.get('/review/:id', auth(['user', 'instructor', 'admin'], { optional: true }), getBookingReviewDetails);
router.get('/:id/review', auth(['user', 'instructor', 'admin'], { optional: true }), getBookingReviewDetails);
router.get('/confirmed/:id', auth(['user', 'instructor', 'admin'], { optional: true }), getBookingConfirmationDetails);
router.get('/:id/confirmed', auth(['user', 'instructor', 'admin'], { optional: true }), getBookingConfirmationDetails);
router.get('/:id/confirmation', auth(['user', 'instructor', 'admin'], { optional: true }), getBookingConfirmationDetails);

// 9. Booking Chat by ID
router.get('/:id/chat', auth(['user', 'instructor', 'admin']), getBookingChat);
router.post('/:id/chat', auth(['user', 'instructor', 'admin']), getBookingChat);

// 10. Booking Details by ID (Figma 40012321:3120)
router.get('/request/:id', auth(['user', 'instructor', 'admin'], { optional: true }), getBookingDetails);
router.get('/:id', auth(['user', 'instructor', 'admin'], { optional: true }), getBookingDetails);

module.exports = router;

