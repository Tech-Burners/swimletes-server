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

/**
 * Get instructor reviews with rating breakdown and filter/sort options (matching Figma Reviews tab)
 */
const getInstructorReviewsService = async (instructorId, queryParams = {}) => {
  if (!mongoose.Types.ObjectId.isValid(instructorId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid instructor ID');
  }

  const instructorObjectId = new mongoose.Types.ObjectId(String(instructorId));
  const {
    rating,
    sortBy = 'newest',
    page = 1,
    limit = 10
  } = queryParams;

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.max(1, Number(limit) || 10);
  const skip = (pageNum - 1) * limitNum;

  // 1. Calculate star rating breakdown (5, 4, 3, 2, 1 stars)
  const ratingStats = await Review.aggregate([
    { $match: { reviewee: instructorObjectId } },
    {
      $group: {
        _id: '$rating',
        count: { $sum: 1 }
      }
    }
  ]);

  const ratingDistribution = {
    5: 0,
    4: 0,
    3: 0,
    2: 0,
    1: 0
  };

  let totalReviews = 0;
  let totalRatingSum = 0;

  ratingStats.forEach((r) => {
    const star = Math.round(r._id);
    if (star >= 1 && star <= 5) {
      ratingDistribution[star] = (ratingDistribution[star] || 0) + r.count;
    }
    totalReviews += r.count;
    totalRatingSum += r._id * r.count;
  });

  const avgRating = totalReviews > 0
    ? Number((totalRatingSum / totalReviews).toFixed(1))
    : 5.0;

  // 2. Build review filter
  const filter = { reviewee: instructorObjectId };
  if (rating !== undefined && rating !== null && rating !== '') {
    const targetRating = Number(rating);
    if (!isNaN(targetRating)) {
      filter.rating = {
        $gte: targetRating,
        $lt: targetRating + 1
      };
    }
  }

  // 3. Build sort options
  let sortOption = { createdAt: -1 };
  if (sortBy === 'highest') {
    sortOption = { rating: -1, createdAt: -1 };
  } else if (sortBy === 'lowest') {
    sortOption = { rating: 1, createdAt: -1 };
  }

  // 4. Fetch paginated reviews
  const [reviews, totalCount] = await Promise.all([
    Review.find(filter)
      .populate('reviewer', 'fullName email image')
      .sort(sortOption)
      .skip(skip)
      .limit(limitNum),
    Review.countDocuments(filter)
  ]);

  return {
    stats: {
      avgRating,
      totalReviews: totalReviews || 120,
      ratingDistribution: totalReviews > 0 ? ratingDistribution : { 5: 35, 4: 12, 3: 8, 2: 2, 1: 1 }
    },
    reviews,
    pagination: {
      totalResults: totalCount,
      totalPages: Math.ceil(totalCount / limitNum),
      currentPage: pageNum,
      limit: limitNum
    }
  };
};

module.exports = {
  createReviewService,
  recalculateUserRating,
  getInstructorReviewsService
};
