const Booking = require('./booking.model');
const User = require('../User/user.model');
const ApiError = require('../../helpers/ApiError');
const httpStatus = require('http-status');

const createBookingService = async (clientId, payload) => {
  const {
    instructorId,
    swimmer,
    lessonType = '60-min private lesson',
    duration = 60,
    date,
    startTime,
    endTime,
    location,
    waiver,
    pricing,
    paymentMethod = 'card'
  } = payload;

  if (!instructorId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Instructor ID is required');
  }

  const instructor = await User.findById(instructorId);
  if (!instructor || instructor.role !== 'instructor') {
    throw new ApiError(httpStatus.NOT_FOUND, 'Instructor not found');
  }

  if (!swimmer || !swimmer.name || !swimmer.age) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Swimmer details (name, age) are required');
  }

  if (!waiver || !waiver.isAgreed || !waiver.legalName) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Liability waiver must be accepted and signed');
  }

  // Calculate pricing breakdown
  const lessonPrice = Number(pricing?.lessonPrice) || 60;
  const bookingFee = Number(pricing?.bookingFee) || +(lessonPrice * 0.05).toFixed(2); // 5% booking fee
  const poolEntryFee = Number(pricing?.poolEntryFee) || 0;
  const travelFee = Number(pricing?.travelFee) || 0;
  const discountAmount = Number(pricing?.discountAmount) || 0;
  const totalAmount = +(lessonPrice + bookingFee + poolEntryFee + travelFee - discountAmount).toFixed(2);

  // Platform commission (15% from instructor)
  const platformCommission = +(lessonPrice * 0.15).toFixed(2);
  const instructorEarnings = +(lessonPrice - platformCommission + poolEntryFee + travelFee).toFixed(2);

  const booking = await Booking.create({
    client: clientId,
    instructor: instructorId,
    swimmer,
    lessonType,
    duration,
    date,
    startTime,
    endTime,
    location,
    waiver: {
      ...waiver,
      isSigned: true,
      signedDate: new Date()
    },
    pricing: {
      lessonPrice,
      bookingFee,
      poolEntryFee,
      travelFee,
      discountAmount,
      totalAmount,
      instructorEarnings,
      platformCommission
    },
    payment: {
      method: paymentMethod,
      status: 'paid', // Or pending webhook
      paidAt: new Date()
    },
    status: 'pending'
  });

  return booking;
};

const getMyBookingsService = async (userId, role, statusFilter) => {
  const query = {};
  if (role === 'instructor') {
    query.instructor = userId;
  } else {
    query.client = userId;
  }

  if (statusFilter) {
    query.status = statusFilter;
  }

  const bookings = await Booking.find(query)
    .populate('client', 'fullName email image')
    .populate('instructor', 'fullName email image')
    .sort({ createdAt: -1 });

  return bookings;
};

const getBookingByIdService = async (bookingId, userId) => {
  const booking = await Booking.findById(bookingId)
    .populate('client', 'fullName email image')
    .populate('instructor', 'fullName email image')
    .populate('clientReview')
    .populate('instructorReview');

  if (!booking) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Booking not found');
  }

  return booking;
};

const updateBookingStatusService = async (bookingId, userId, userRole, status, payload = {}) => {
  const validStatuses = ['accepted', 'declined', 'active', 'completed', 'cancelled'];
  if (!validStatuses.includes(status)) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Invalid status. Must be one of: ${validStatuses.join(', ')}`);
  }

  const booking = await Booking.findById(bookingId);
  if (!booking) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Booking not found');
  }

  const isClient = booking.client.toString() === userId.toString();
  const isInstructor = booking.instructor.toString() === userId.toString();
  const isAdmin = userRole === 'admin';

  if (!isClient && !isInstructor && !isAdmin) {
    throw new ApiError(httpStatus.FORBIDDEN, 'You are not authorized to update this booking');
  }

  // Role permissions on status transitions
  if (['accepted', 'declined'].includes(status) && !isInstructor && !isAdmin) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Only instructors or admins can accept or decline bookings');
  }

  if (status === 'completed' && !isInstructor && !isAdmin) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Only instructors or admins can mark a booking as completed');
  }

  booking.status = status;

  if (status === 'declined') {
    booking.declinedReason = payload.reason || '';
    booking.declinedAt = new Date();
  } else if (status === 'cancelled') {
    booking.cancelledBy = isClient ? 'client' : (isInstructor ? 'instructor' : 'admin');
    booking.cancellationReason = payload.reason || '';
    booking.cancelledAt = new Date();
  } else if (status === 'completed') {
    booking.completedAt = new Date();
  }

  await booking.save();

  return booking;
};

module.exports = {
  createBookingService,
  getMyBookingsService,
  getBookingByIdService,
  updateBookingStatusService
};

