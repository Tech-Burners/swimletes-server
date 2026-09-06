const mongoose = require('mongoose');

const serviceAndPricingSchema = new mongoose.Schema(
  {
    instructor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true
    },

    // 1. Durations supported in minutes
    durations: {
      type: [Number],
      enum: [30, 45, 60, 90],
      default: [60]
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
      pools: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Pool'
        }
      ]
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
