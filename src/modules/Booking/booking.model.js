const mongoose = require('mongoose');

// Swimmer sub-schema (Steps 1 & 2: "Who's swimming?")
const swimmerSchema = new mongoose.Schema(
  {
    bookedFor: {
      type: String,
      enum: ['myself', 'someone_else'],
      default: 'someone_else'
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    age: {
      type: Number,
      required: true,
      min: 0
    },
    comfortLevel: {
      type: String,
      enum: [
        'never_been_in_water',  // "Never been in water"
        'nervous_beginner',     // "Nervous beginner"
        'can_float_paddle',     // "Can float & paddle"
        'swims_confidently'     // "Swims Confidently"
      ],
      default: 'nervous_beginner'
    },
    notes: {
      type: String,
      default: '',
      trim: true // "Optional – fears, ear tubes, past bad experience, medical notes"
    }
  },
  { _id: false }
);

// Waiver sub-schema (Step 4: "Waiver Form")
const waiverAgreementSchema = new mongoose.Schema(
  {
    isSigned: {
      type: Boolean,
      default: false
    },
    signerRelationship: {
      type: String,
      enum: ['parent', 'legal_guardian', 'self'],
      default: 'parent'
    },
    legalName: {
      type: String,
      trim: true,
      default: '' // "Type your full legal name"
    },
    signedDate: {
      type: Date,
      default: Date.now
    },
    isAgreed: {
      type: Boolean,
      default: false // "I've read form and I accept it on swimmer's behalf"
    },
    waiverVersion: {
      type: String,
      default: 'v1.0'
    }
  },
  { _id: false }
);

// Location sub-schema
const bookingLocationSchema = new mongoose.Schema(
  {
    locationType: {
      type: String,
      enum: [
        'public_pool',      // "Meet at a public pool"
        'instructor_pool',  // "Use instructor's pool"
        'client_pool'       // "Travel to family's private pool"
      ],
      default: 'public_pool'
    },
    poolName: {
      type: String,
      default: '' // e.g. "Oak Lawn Community Pool"
    },
    address: {
      type: String,
      required: true // e.g. "3418 Cedar Springs Rd"
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
      type: Number, // In miles (if client_pool)
      default: 0
    }
  },
  { _id: false }
);

// Pricing Breakdown sub-schema (Step 5: "Review & Pay")
const priceBreakdownSchema = new mongoose.Schema(
  {
    lessonPrice: {
      type: Number,
      required: true,
      min: 0 // Base rate (e.g. $60.00)
    },
    bookingFee: {
      type: Number,
      default: 0,
      min: 0 // 5% client platform fee (e.g. $3.00)
    },
    poolEntryFee: {
      type: Number,
      default: 0,
      min: 0 // Entry fee charged by public pool (e.g. $8.00)
    },
    travelFee: {
      type: Number,
      default: 0,
      min: 0 // Distance surcharge if outside free radius
    },
    discountAmount: {
      type: Number,
      default: 0,
      min: 0
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0 // Total charged at checkout (e.g. $63.00 or $71.00)
    },
    instructorEarnings: {
      type: Number,
      required: true,
      min: 0 // Payout amount to instructor
    },
    platformCommission: {
      type: Number,
      default: 0,
      min: 0 // Commission retained by Swimletes
    }
  },
  { _id: false }
);

// Payment sub-schema
const paymentInfoSchema = new mongoose.Schema(
  {
    method: {
      type: String,
      enum: ['card', 'paypal', 'apple_pay', 'google_pay'],
      default: 'card'
    },
    status: {
      type: String,
      enum: ['unpaid', 'pending', 'paid', 'refunded', 'partially_refunded', 'failed'],
      default: 'unpaid'
    },
    transactionId: {
      type: String,
      default: ''
    },
    paidAt: {
      type: Date
    }
  },
  { _id: false }
);

// Master Booking Schema
const bookingSchema = new mongoose.Schema(
  {
    bookingId: {
      type: String,
      unique: true,
      index: true
    },

    // 1. Involved Parties
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

    // 2. Swimmer Info (Steps 1 & 2)
    swimmer: {
      type: swimmerSchema,
      required: true
    },

    // 3. Lesson Details & Duration
    lessonType: {
      type: String,
      default: '60-min private lesson'
    },
    duration: {
      type: Number, // In minutes: 30, 45, 60, 90
      enum: [30, 45, 60, 90],
      default: 60
    },

    // 4. Date & Time (Step 3)
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

    // 5. Location Details
    location: {
      type: bookingLocationSchema,
      required: true
    },

    // 6. Liability Waiver (Step 4)
    waiver: {
      type: waiverAgreementSchema,
      required: true
    },

    // 7. Pricing & Payment Breakdown (Step 5)
    pricing: {
      type: priceBreakdownSchema,
      required: true
    },
    payment: {
      type: paymentInfoSchema,
      default: () => ({})
    },

    // 8. Booking Lifecycle Status
    status: {
      type: String,
      enum: [
        'pending',   // Waiting for instructor approval
        'accepted',  // Confirmed by instructor
        'declined',  // Declined by instructor
        'active',    // Happening now / in-progress
        'completed', // Completed successfully
        'cancelled', // Cancelled by client or instructor
        'disputed'   // Under dispute investigation
      ],
      default: 'pending',
      index: true
    },

    // Request Expiration (For pending booking requests - default 24h)
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 24 * 60 * 60 * 1000)
    },

    // Decline Information
    declinedReason: {
      type: String,
      default: ''
    },
    declinedAt: {
      type: Date
    },

    // Cancellation Details & Policies
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
      enum: [
        'free',            // >24 hours prior (100% refund)
        'late',            // <24 hours prior (50% charge / partial refund)
        'non_refundable'   // <2 hours prior / no show
      ]
    },
    refundAmount: {
      type: Number,
      default: 0
    },
    cancelledAt: {
      type: Date
    },

    // Completion & Reviews
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
    },
    isClientReviewed: {
      type: Boolean,
      default: false
    },
    isInstructorReviewed: {
      type: Boolean,
      default: false
    },
    clientReview: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Review'
    },
    instructorReview: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Review'
    },
    lastRemindedAt: {
      type: Date
    }
  },
  {
    timestamps: true
  }
);

// Auto-generate human-readable Booking Reference ID (e.g. SW-782941)
bookingSchema.pre('save', async function (next) {
  if (!this.bookingId) {
    const randomCode = Math.floor(100000 + Math.random() * 900000);
    this.bookingId = `SW-${randomCode}`;
  }
  next();
});

bookingSchema.index({ 'location.location': '2dsphere' });

module.exports = mongoose.model('Booking', bookingSchema);
