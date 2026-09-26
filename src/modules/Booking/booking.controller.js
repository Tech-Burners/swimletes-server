const catchAsync = require('../../helpers/catchAsync');
const response = require('../../helpers/response');
const { status } = require('http-status');
const {
  createBookingService,
  getMyBookingsService,
  getBookingTabCountsService,
  getBookingByIdService,
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
  adminUpdateBookingStatusService
} = require('./booking.service');

// User creates a booking
const createBooking = catchAsync(async (req, res) => {
  const result = await createBookingService(req.User._id, req.body);
  return res.status(status.CREATED).json(
    response({
      status: 'OK',
      statusCode: status.CREATED,
      message: 'Booking created successfully',
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

// Instructor Marks booking complete
const completeBooking = catchAsync(async (req, res) => {
  const result = await completeBookingService(req.params.id, req.User._id);
  return res.status(status.OK).json(
    response({
      status: 'OK',
      statusCode: status.OK,
      message: 'Booking marked as complete',
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

module.exports = {
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
};


