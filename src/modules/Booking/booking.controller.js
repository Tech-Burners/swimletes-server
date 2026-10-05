const catchAsync = require('../../helpers/catchAsync');
const response = require('../../helpers/response');
const { status } = require('http-status');
const {
  createBookingService,
  getMyBookingsService,
  getBookingTabCountsService,
  getBookingByIdService,
  getBookingChatService,
  acceptBookingService,
  declineBookingService,
  markBookingActiveService,
  completeBookingService,
  cancelBookingService,
  rebookLessonService,
  updateBookingStatusService,
  sendBookingReminderService,
  getAdminBookingsListService,
  getAdminBookingDetailsService,
  adminUpdateBookingStatusService,
  createBookingPaymentIntentService,
  confirmBookingPaymentService,
  createBookingCheckoutSessionService,
  verifyCheckoutPaymentSuccessService,
  handlePaymentFailService,
  handleStripeWebhookService,
  getBookingReviewDetailsService,
  getBookingConfirmationDetailsService,
  checkBookingConflictService
} = require('./booking.service');

// User creates a booking
const createBooking = catchAsync(async (req, res) => {
  const payload = { ...req.body, req };
  const result = await createBookingService(req.User._id, payload);
  return res.status(status.CREATED).json(
    response({
      status: 'OK',
      statusCode: status.CREATED,
      message: result.paymentUrl
        ? 'Booking initiated. Please complete payment using the generated payment link.'
        : 'Booking created successfully',
      data: result
    })
  );
});

// View my bookings (User / Instructor) with tab filters (upcoming, active, completed, requests, cancelled)
const getMyBookings = catchAsync(async (req, res) => {
  const result = await getMyBookingsService(req.User._id, req.User.role, req.query);
  return res.status(status.OK).json(
    response({
      status: 'OK',
      statusCode: status.OK,
      message: 'Bookings fetched successfully',
      data: result
    })
  );
});

// Get counts for each tab (requests, active, upcoming, completed, cancelled)
const getBookingTabCounts = catchAsync(async (req, res) => {
  const result = await getBookingTabCountsService(req.User._id, req.User.role);
  return res.status(status.OK).json(
    response({
      status: 'OK',
      statusCode: status.OK,
      message: 'Booking tab counts fetched successfully',
      data: result
    })
  );
});

// Get booking details
const getBookingDetails = catchAsync(async (req, res) => {
  const userId = req.User ? req.User._id : null;
  const userRole = req.User ? req.User.role : (req.query.role || 'instructor');
  const result = await getBookingByIdService(req.params.id, userId, userRole);
  return res.status(status.OK).json(
    response({
      status: 'OK',
      statusCode: status.OK,
      type: 'BookingDetails',
      message: 'Booking details fetched successfully',
      data: result
    })
  );
});

// Get chat conversation / ID for booking
const getBookingChat = catchAsync(async (req, res) => {
  const userId = req.User ? req.User._id : null;
  const result = await getBookingChatService(req.params.id, userId);
  return res.status(status.OK).json(
    response({
      status: 'OK',
      statusCode: status.OK,
      message: 'Booking chat fetched successfully',
      data: result
    })
  );
});

// Instructor Accepts booking request
const acceptBooking = catchAsync(async (req, res) => {
  const result = await acceptBookingService(req.params.id, req.User._id);
  return res.status(status.OK).json(
    response({
      status: 'OK',
      statusCode: status.OK,
      message: 'Booking accepted successfully',
      data: result
    })
  );
});

// Instructor Declines booking request
const declineBooking = catchAsync(async (req, res) => {
  const { reason } = req.body;
  const result = await declineBookingService(req.params.id, req.User._id, reason);
  return res.status(status.OK).json(
    response({
      status: 'OK',
      statusCode: status.OK,
      message: 'Booking declined successfully',
      data: result
    })
  );
});

// Mark booking in progress / active
const startBooking = catchAsync(async (req, res) => {
  const result = await markBookingActiveService(req.params.id, req.User._id, req.User.role);
  return res.status(status.OK).json(
    response({
      status: 'OK',
      statusCode: status.OK,
      message: 'Booking marked as active / in-progress',
      data: result
    })
  );
});

// Mark booking complete (User / Instructor / Admin - two-sided confirmation)
const completeBooking = catchAsync(async (req, res) => {
  const result = await completeBookingService(req.params.id, req.User._id, req.User.role);
  return res.status(status.OK).json(
    response({
      status: 'OK',
      statusCode: status.OK,
      message: result.message || 'Booking marked as complete',
      data: result
    })
  );
});

// Cancel booking (Client or Instructor)
const cancelBooking = catchAsync(async (req, res) => {
  const { reason } = req.body;
  const result = await cancelBookingService(req.params.id, req.User._id, req.User.role, reason);
  return res.status(status.OK).json(
    response({
      status: 'OK',
      statusCode: status.OK,
      message: 'Booking cancelled successfully',
      data: result
    })
  );
});

// Rebook lesson data for "Book Again" flow
const rebookLesson = catchAsync(async (req, res) => {
  const result = await rebookLessonService(req.params.id, req.User._id);
  return res.status(status.OK).json(
    response({
      status: 'OK',
      statusCode: status.OK,
      message: 'Rebooking information retrieved successfully',
      data: result
    })
  );
});

// Update booking status (legacy / generic endpoint)
const updateBookingStatus = catchAsync(async (req, res) => {
  const { status: newStatus, reason } = req.body;
  const result = await updateBookingStatusService(
    req.params.id,
    req.User._id,
    req.User.role,
    newStatus,
    { reason }
  );
  return res.status(status.OK).json(
    response({
      status: 'OK',
      statusCode: status.OK,
      message: `Booking status updated to ${newStatus}`,
      data: result
    })
  );
});

// Send payment release reminder to client (Instructor on completed bookings)
const sendBookingReminder = catchAsync(async (req, res) => {
  const result = await sendBookingReminderService(req.params.id, req.User._id);
  return res.status(status.OK).json(
    response({
      status: 'OK',
      statusCode: status.OK,
      message: 'Reminder sent successfully',
      data: result
    })
  );
});

// Admin Bookings List (Figma 40012554:17793)
const getAdminBookingsListController = catchAsync(async (req, res) => {
  const result = await getAdminBookingsListService(req.query);
  return res.status(status.OK).json(
    response({
      status: 'OK',
      statusCode: status.OK,
      type: 'AdminBookings',
      message: 'Admin bookings list fetched successfully',
      data: result
    })
  );
});

// Admin Booking Details Drawer (Figma 40012554:18447)
const getAdminBookingDetailsController = catchAsync(async (req, res) => {
  const result = await getAdminBookingDetailsService(req.params.id);
  return res.status(status.OK).json(
    response({
      status: 'OK',
      statusCode: status.OK,
      type: 'AdminBookingDetails',
      message: 'Admin booking details fetched successfully',
      data: result
    })
  );
});

// Admin Update Booking Status
const adminUpdateBookingStatusController = catchAsync(async (req, res) => {
  const result = await adminUpdateBookingStatusService(req.params.id, req.body);
  return res.status(status.OK).json(
    response({
      status: 'OK',
      statusCode: status.OK,
      type: 'AdminBookingStatus',
      message: 'Booking updated successfully',
      data: result
    })
  );
});

// Create Stripe PaymentIntent for Booking (Step 5: Review & Pay)
const createBookingPaymentIntent = catchAsync(async (req, res) => {
  const result = await createBookingPaymentIntentService(req.User._id, req.body);
  return res.status(status.OK).json(
    response({
      status: 'OK',
      statusCode: status.OK,
      message: 'Payment intent created successfully',
      data: result
    })
  );
});

// Confirm Booking Payment after Stripe sheet completes
const confirmBookingPayment = catchAsync(async (req, res) => {
  const bookingId = req.params.id || req.body.bookingId;
  const paymentIntentId = req.body.paymentIntentId || req.body.stripePaymentIntentId;
  const result = await confirmBookingPaymentService(bookingId, req.User._id, paymentIntentId);
  return res.status(status.OK).json(
    response({
      status: 'OK',
      statusCode: status.OK,
      message: 'Payment success',
      data: result
    })
  );
});

// Stripe Webhook Event Receiver
const stripeWebhookController = catchAsync(async (req, res) => {
  const signature = req.headers['stripe-signature'];
  try {
    const result = await handleStripeWebhookService(req.rawBody, signature, req.body);
    return res.status(status?.OK || 200).json(result || { received: true });
  } catch (err) {
    console.error('[Stripe Webhook Error]', err.message);
    return res.status(status?.OK || 200).json({ received: true, warning: err.message });
  }
});

// Create or re-generate Stripe Checkout Link for a Booking
const createCheckoutSessionController = catchAsync(async (req, res) => {
  const bookingId = req.params.id || req.body.bookingId;
  const result = await createBookingCheckoutSessionService(req.User._id, {
    ...req.body,
    bookingId,
    req
  });
  return res.status(status.OK).json(
    response({
      status: 'OK',
      statusCode: status.OK,
      message: 'Stripe checkout payment link generated successfully',
      data: result
    })
  );
});

// Stripe Payment Success API (GET & POST) - Returns JSON API response only
const bookingPaymentSuccessController = catchAsync(async (req, res) => {
  const sessionId = req.query.session_id || req.body.session_id || req.query.sessionId || req.body.sessionId;
  const bookingId = req.query.booking_id || req.body.booking_id || req.query.bookingId || req.body.bookingId || req.params.id;
  const paymentIntentId = req.query.payment_intent || req.body.payment_intent || req.query.paymentIntentId || req.body.paymentIntentId;

  const result = await verifyCheckoutPaymentSuccessService(sessionId, bookingId, paymentIntentId);

  // If payment failed, unpaid, or conflicted -> return JSON error response
  if (!result.paid) {
    return res.status(status.BAD_REQUEST).json(
      response({
        status: 'Error',
        statusCode: status.BAD_REQUEST,
        message: result.message || 'Payment has not been completed or has failed',
        data: result
      })
    );
  }

  // Payment is success -> return JSON response with message "Payment success"
  return res.status(status.OK).json(
    response({
      status: 'OK',
      statusCode: status.OK,
      message: 'Payment success',
      data: result
    })
  );
});

// Stripe Payment Fail / Cancel API (GET & POST) - Returns JSON API response only
const bookingPaymentFailController = catchAsync(async (req, res) => {
  const sessionId = req.query.session_id || req.body.session_id || req.query.sessionId || req.body.sessionId;
  const bookingId = req.query.booking_id || req.body.booking_id || req.query.bookingId || req.body.bookingId || req.params.id;
  const reason = req.body.reason || req.query.reason || req.body.message || 'Payment cancelled or failed';

  const result = await handlePaymentFailService(sessionId, bookingId, reason);

  return res.status(status.OK).json(
    response({
      status: 'OK',
      statusCode: status.OK,
      message: 'Payment cancelled or failed',
      data: result
    })
  );
});

const bookingPaymentCancelController = bookingPaymentFailController;

// Check Booking Conflict (GET & POST /api/v1/bookings/check-conflict)
const checkBookingConflictController = catchAsync(async (req, res) => {
  const query = { ...req.query, ...req.body };
  const result = await checkBookingConflictService(query, req.User?._id);
  return res.status(status.OK).json(
    response({
      status: 'OK',
      statusCode: status.OK,
      message: result.message,
      data: result
    })
  );
});

// Get Review & Pay details for a booking (Figma Node 40012199:3518)
const getBookingReviewDetails = catchAsync(async (req, res) => {
  const result = await getBookingReviewDetailsService(req.params.id, req.User?._id);
  return res.status(status.OK).json(
    response({
      status: 'OK',
      statusCode: status.OK,
      message: 'Review and pay details fetched successfully',
      data: result
    })
  );
});

// Get Booking Confirmed details for a booking (Figma Node 40012199:3699)
const getBookingConfirmationDetails = catchAsync(async (req, res) => {
  const result = await getBookingConfirmationDetailsService(req.params.id, req.User?._id);
  return res.status(status.OK).json(
    response({
      status: 'OK',
      statusCode: status.OK,
      message: 'Booking confirmation details fetched successfully',
      data: result
    })
  );
});

module.exports = {
  createBooking,
  getMyBookings,
  getBookingTabCounts,
  getBookingDetails,
  getBookingChat,
  getBookingReviewDetails,
  getBookingConfirmationDetails,
  checkBookingConflictController,
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
  stripeWebhookController
};


