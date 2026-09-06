const catchAsync = require('../../helpers/catchAsync');
const response = require('../../helpers/response');
const { status } = require('http-status');
const {
  createBookingService,
  getMyBookingsService,
  getBookingByIdService
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

// View my bookings (User / Instructor)
const getMyBookings = catchAsync(async (req, res) => {
  const { status: statusFilter } = req.query;
  const result = await getMyBookingsService(req.User._id, req.User.role, statusFilter);
  return res.status(status.OK).json(
    response({
      status: 'OK',
      statusCode: status.OK,
      message: 'Bookings fetched successfully',
      data: result
    })
  );
});

// Get booking details
const getBookingDetails = catchAsync(async (req, res) => {
  const result = await getBookingByIdService(req.params.id, req.User._id);
  return res.status(status.OK).json(
    response({
      status: 'OK',
      statusCode: status.OK,
      message: 'Booking details fetched successfully',
      data: result
    })
  );
});

module.exports = {
  createBooking,
  getMyBookings,
  getBookingDetails
};
