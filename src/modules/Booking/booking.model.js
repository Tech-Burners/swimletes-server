const mongoose = require('mongoose');

const swimmerInfoSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    age: {
      type: Number,
      required: true
    },
    skillLevel: {
      type: String, // e.g. "Nervous beginner", "Intermediate", "Advanced"
      default: 'Beginner'
    },
    medicalNotes: {
      type: String,
      default: ''
    }
  },
  { _id: false }
);

const priceBreakdownSchema = new mongoose.Schema(
  {
    lessonPrice: {
      type: Number,
      required: true,
      min: 0
    },
    bookingFee: {
      type: Number,
      default: 0,
      min: 0 // e.g. 5% platform fee paid by parent
    },
    poolEntryFee: {
      type: Number,
      default: 0,
      min: 0 // Entry fee if public pool charges instructor/swimmer
    },
    travelFee: {
      type: Number,
      default: 0,
      min: 0 // Distance fee if beyond free radius
    },
    discountAmount: {
      type: Number,
      default: 0,
      min: 0
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0
    },
    instructorEarnings: {
      type: Number,
      required: true,
      min: 0
    },
    platformCommission: {
      type: Number,
      default: 0,
      min: 0 // Commission fee deducted from instructor
    }
  },
  { _id: false }
);

const bookingSchema = new mongoose.Schema(
  {
    bookingId: {
      type: String,
      unique: true,
      index: true
    },

    client: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    instructor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    // Swimmer(s) attending the lesson
    swimmer: {
      type: swimmerInfoSchema,
      required: true
    },

    // Lesson configurations
    lessonType: {
      type: String,
      default: 'Private lesson'
    },
    duration: {
      type: Number, // In minutes: 30, 45, 60, 90
      enum: [30, 45, 60, 90],
      default: 60
    },

    // Schedule & Date
    date: {
      type: Date,
      required: true,
      index: true
    },
    startTime: {
      type: String, // e.g. "10:00 AM"
      required: true
    },
    endTime: {
      type: String, // e.g. "11:00 AM"
      required: true
    },

    // Location details
    locationType: {
      type: String,
      enum: ['instructor_pool', 'client_pool', 'public_pool'],
      required: true
    },
    pool: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Pool',
      required: false
    },
    poolName: {
      type: String,
      default: ''
    },
    address: {
      type: String,
      required: true
    },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point'
      },
      coordinates: {
        type: [Number],
        default: [0, 0] // [longitude, latitude]
      }
    },
    travelDistance: {
      type: Number, // In miles, if client_pool
      default: 0
    },

    // Pricing & Fees
    pricing: {
      type: priceBreakdownSchema,
      required: true
    },

    // Payment Information
    paymentMethod: {
      type: String,
      enum: ['card', 'paypal', 'apple_pay', 'google_pay'],
      default: 'card'
    },
    paymentStatus: {
      type: String,
      enum: ['unpaid', 'pending', 'paid', 'refunded', 'partially_refunded', 'failed'],
      default: 'unpaid'
    },
    transactionId: {
      type: String,
      default: ''
    },

    // Liability Waiver
    waiverSigned: {
      type: Boolean,
      default: false
    },
    waiverSignedAt: {
      type: Date
    },

    // Booking Lifecycle Status
    status: {
      type: String,
      enum: [
        'pending',   // Waiting for instructor approval
        'accepted',  // Confirmed by instructor
        'declined',  // Declined by instructor
        'active',    // Lesson happening now
        'completed', // Finished
        'cancelled', // Cancelled
        'disputed'   // Dispute raised
      ],
      default: 'pending',
      index: true
    },

    // Decline Information
    declinedReason: {
      type: String,
      default: ''
    },
    declinedAt: {
      type: Date
    },

    // Cancellation Information
    cancelledBy: {
      type: String,
      enum: ['client', 'instructor', 'admin']
    },
    cancellationReason: {
      type: String,
      default: ''
    },
    cancellationWindow: {
      type: String,
      enum: ['free', 'late', 'non_refundable'] // Free (>24h), Late (50% charge), Non-refundable (<2h)
    },
    refundAmount: {
      type: Number,
      default: 0
    },
    cancelledAt: {
      type: Date
    },

    // Completion & Review Information
    completedAt: {
      type: Date
    },
    isReviewed: {
      type: Boolean,
      default: false
    },
    review: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Review'
    }
  },
  {
    timestamps: true
  }
);

// Generate unique human-readable booking ID before save (e.g. SW-10293)
bookingSchema.pre('save', async function (next) {
  if (!this.bookingId) {
    const randomCode = Math.floor(100000 + Math.random() * 900000);
    this.bookingId = `SW-${randomCode}`;
  }
  next();
});

bookingSchema.index({ 'location': '2dsphere' });

module.exports = mongoose.model('Booking', bookingSchema);
