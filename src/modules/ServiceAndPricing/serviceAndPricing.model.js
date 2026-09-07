const mongoose = require('mongoose');

// Embedded Public Pool sub-schema (Figma: Add pool modal)
const publicPoolSchema = new mongoose.Schema(
  {
    poolName: {
      type: String,
      required: true,
      trim: true // e.g. "Riverside Community Pool" or "Oak Lawn Community Pool"
    },
    address: {
      type: String,
      required: true,
      trim: true // e.g. "123 Main Street, Austin, TX"
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
    hasEntryFee: {
      type: Boolean,
      default: false
    },
    entryFee: {
      type: Number,
      default: 0,
      min: 0 // e.g. 8.00 or 10.00
    }
  },
  { _id: true }
);

const serviceAndPricingSchema = new mongoose.Schema(
  {
    instructor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true
    },

    // 1. Lesson duration in minutes (e.g. 60)
    duration: {
      type: Number,
      enum: [30, 45, 60, 90],
      default: 60
    },

    // 2. Base price per lesson
    pricePerLesson: {
      type: Number,
      required: true,
      min: 0,
      default: 60.0
    },

    // 3. Location Option: Instructor's own pool (Parents come to instructor)
    ownPool: {
      enabled: { type: Boolean, default: false },
      images: [{ type: String }],
      address: { type: String, default: '' },
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
      }
    },

    // 4. Location Option: Travel to family's private pool
    travelToClient: {
      enabled: { type: Boolean, default: false },
      includedDistance: { type: Number, default: 15 }, // Free travel radius in miles
      maxDistance: { type: Number, default: 35 },      // Won't travel past X miles
      surcharges: [
        {
          minDistance: { type: Number, required: true },
          maxDistance: { type: Number, required: true },
          fee: { type: Number, required: true }
        }
      ]
    },

    // 5. Location Option: Public / Community pools
    publicPools: {
      enabled: { type: Boolean, default: false },
      pools: [publicPoolSchema]
    },

    // 6. Target student age groups
    ageGroups: {
      type: [String],
      enum: ['under_5', 'kids_5_12', 'teens', 'adults'],
      default: ['kids_5_12', 'teens', 'adults']
    },

    // 7. Languages spoken
    languages: {
      type: [String],
      default: ['English']
    },

    // 8. Custom Q&A for parents ("Good to know")
    goodToKnow: [
      {
        question: { type: String, required: true },
        answer: { type: String, required: true }
      }
    ]
  },
  {
    timestamps: true
  }
);

serviceAndPricingSchema.index({ 'ownPool.location': '2dsphere' });

module.exports = mongoose.model('ServiceAndPricing', serviceAndPricingSchema);
