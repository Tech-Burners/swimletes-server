const mongoose = require('mongoose');

const refundSchema = new mongoose.Schema(
  {
    refundId: {
      type: String,
      unique: true,
      index: true
    },
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      required: true,
      index: true
    },
    bookingId: {
      type: String,
      default: '',
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
    amount: {
      type: Number,
      required: true,
      min: 0
    },
    source: {
      type: String,
      enum: ['Dispute', 'Cancellation', 'Manual'],
      default: 'Manual',
      index: true
    },
    status: {
      type: String,
      enum: ['Processed', 'Failed', 'Pending'],
      default: 'Processed',
      index: true
    },
    date: {
      type: Date,
      default: Date.now,
      index: true
    },
    reason: {
      type: String,
      default: ''
    },
    stripeRefundId: {
      type: String,
      default: null
    },
    issuedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    }
  },
  {
    timestamps: true
  }
);

// Auto-generate refund ID like RF-12345
refundSchema.pre('save', function (next) {
  if (!this.refundId) {
    const randomSuffix = Math.floor(10000 + Math.random() * 90000);
    this.refundId = `RF-${randomSuffix}`;
  }
  next();
});

const Refund = mongoose.model('Refund', refundSchema);

module.exports = Refund;
