const mongoose = require('mongoose');
const Review = require('./review.model');
const Booking = require('../Booking/booking.model');
const User = require('../User/user.model');
const ApiError = require('../../helpers/ApiError');
const { status: httpStatus } = require('http-status');

/**
 * Recalculate and update the cached avgRating, totalReviews, and ratingCount on the User document.
 * @param {string|mongoose.Types.ObjectId} userId
 */
const recalculateUserRating = async (userId) => {
  const userObjectId = new mongoose.Types.ObjectId(String(userId));

  const stats = await Review.aggregate([
    { $match: { reviewee: userObjectId } },
    {
      $group: {
        _id: '$reviewee',
        avgRating: { $avg: '$rating' },
        totalReviews: { $sum: 1 }
      }
    }
  ]);

  let avgRating = 0;
  let totalReviews = 0;

  if (stats.length > 0) {
    avgRating = Number(stats[0].avgRating.toFixed(2));
    totalReviews = stats[0].totalReviews;
  }

  await User.findByIdAndUpdate(userObjectId, {
    avgRating,
    totalReviews,
    ratingCount: totalReviews
  });

  return { avgRating, totalReviews };
};

/**
 * Mutual review for a booking:
 * - When client provides review -> reviewee is instructor
 * - When instructor provides review -> reviewee is client
 */
const createReviewService = async (reviewerId, payload) => {
  const {
    bookingId,
    rating,
    comment = ''
  } = payload;

  if (!bookingId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Booking ID is required');
  }

  const numericRating = Number(rating);
  if (!numericRating || numericRating < 0 || numericRating > 5) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Rating must be a number between 0 and 5');
  }

  const booking = await Booking.findById(bookingId);
  if (!booking) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Booking not found');
  }

  // Verify that reviewer is a participant in this booking
  const isClient = booking.client.toString() === reviewerId.toString();
  const isInstructor = booking.instructor.toString() === reviewerId.toString();

  if (!isClient && !isInstructor) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'You are not authorized to review this booking'
    );
  }

  // Prevent reviews on declined or cancelled bookings
  if (['declined', 'cancelled'].includes(booking.status)) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Cannot review a booking with status '${booking.status}'`
    );
  }

  // Determine reviewer role and reviewee
  let reviewerRole;
  let revieweeId;

  if (isClient) {
    reviewerRole = 'user';
    revieweeId = booking.instructor;

    if (booking.isClientReviewed) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'You have already reviewed this booking');
    }
  } else {
    reviewerRole = 'instructor';
    revieweeId = booking.client;

    if (booking.isInstructorReviewed) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'You have already reviewed this booking');
    }
  }

  // Ensure no existing review document in database for this reviewer and booking
  const existingReview = await Review.findOne({
    booking: booking._id,
    reviewer: reviewerId
  });

  if (existingReview) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'You have already submitted a review for this booking');
  }

  // Create review document
  const review = await Review.create({
    booking: booking._id,
    reviewer: reviewerId,
    reviewee: revieweeId,
    reviewerRole,
    rating: numericRating,
    comment: String(comment || '').trim()
  });

  // Update Booking flags
  if (isClient) {
    booking.isClientReviewed = true;
    booking.clientReview = review._id;
  } else {
    booking.isInstructorReviewed = true;
    booking.instructorReview = review._id;
  }

  booking.isReviewed = true;
  if (!booking.review) {
    booking.review = review._id;
  }
  await booking.save();

  // Recalculate target user's aggregated rating
  await recalculateUserRating(revieweeId);

  const populatedReview = await Review.findById(review._id)
    .populate('reviewer', 'fullName email image role')
    .populate('reviewee', 'fullName email image role')
    .populate({
      path: 'booking',
      select: 'bookingId date startTime endTime lessonType status swimmer'
    });

  return populatedReview;
};

module.exports = {
  createReviewService,
  recalculateUserRating
};
