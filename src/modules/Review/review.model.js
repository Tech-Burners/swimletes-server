const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
  {
    // The lesson/booking this review belongs to
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      required: [true, 'Booking reference is required'],
      index: true
    },

    // The user or instructor who wrote the review
    reviewer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Reviewer is required'],
      index: true
    },

    // The user or instructor receiving the review
    reviewee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Reviewee is required'],
      index: true
    },

    // Role of the reviewer when submitting the review
    reviewerRole: {
      type: String,
      enum: ['user', 'instructor'],
      required: [true, 'Reviewer role is required']
    },

    // Rating star count from 0 to 5
    rating: {
      type: Number,
      required: [true, 'Rating is required'],
      min: [0, 'Rating must be at least 0'],
      max: [5, 'Rating cannot exceed 5 stars']
    },

    // Optional text review / feedback
    comment: {
      type: String,
      trim: true,
      default: ''
    },

    // Optional tags / badges (e.g., "Patient", "Punctual", "Great with kids", "Great communication", "Quick learner")
    tags: [
      {
        type: String,
        trim: true
      }
    ],

    // Optional public reply from the reviewee
    reply: {
      text: {
        type: String,
        trim: true,
        default: ''
      },
      repliedAt: {
        type: Date
      }
    },

    // Whether the reviewer chose to post anonymously to other viewers
    isAnonymous: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true
  }
);

// Prevent a user/instructor from reviewing the same booking multiple times
reviewSchema.index({ booking: 1, reviewer: 1 }, { unique: true });

// Optimize index for fetching user reviews sorted by date
reviewSchema.index({ reviewee: 1, createdAt: -1 });
reviewSchema.index({ reviewer: 1, createdAt: -1 });

module.exports = mongoose.model('Review', reviewSchema);
