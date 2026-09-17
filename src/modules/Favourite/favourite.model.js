const mongoose = require('mongoose');

const favouriteSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    instructor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true
    },
    service: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ServiceAndPricing',
      index: true
    }
  },
  { timestamps: true }
);

// Compound indexes to prevent duplicate entries per user
favouriteSchema.index({ user: 1, instructor: 1 }, { unique: true, sparse: true });
favouriteSchema.index({ user: 1, service: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Favourite', favouriteSchema);