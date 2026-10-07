const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema(
  {
    transactionId: {
      type: String,
      unique: true,
      index: true
    },
    instructor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    client: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      default: null
    },
    type: {
      type: String,
      enum: ['lesson_payout', 'late_cancellation', 'withdrawal', 'bonus', 'refund'],
      required: true,
      default: 'lesson_payout'
    },
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'cancelled', 'rejected'],
      default: 'completed'
    },
    rejectionReason: {
      type: String,
      default: ''
    },
    availableBalanceAtRequest: {
      type: Number,
      default: 0
    },
    actionDate: {
      type: Date,
      default: null
    },
    processedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    grossAmount: {
      type: Number,
      default: 0
    },
    platformFee: {
      type: Number,
      default: 0
    },
    netAmount: {
      type: Number,
      required: true
    },
    isPositive: {
      type: Boolean,
      default: true
    },
    title: {
      type: String,
      default: ''
    },
    subtitle: {
      type: String,
      default: ''
    },
    description: {
      type: String,
      default: ''
    },
    avatar: {
      type: String,
      default: ''
    },
    note: {
      type: String,
      default: ''
    },
    bankDetails: {
      bankName: { type: String, default: '' },
      accountHolderName: { type: String, default: '' },
      routingNumber: { type: String, default: '' },
      accountNumber: { type: String, default: '' },
      accountLast4: { type: String, default: '' },
      maskedAccountNumber: { type: String, default: '' }
    },
    stripePayoutId: {
      type: String,
      default: null
    },
    date: {
      type: Date,
      default: Date.now,
      index: true
    }
  },
  {
    timestamps: true
  }
);

// Auto-generate transaction ID like TXN-123456
transactionSchema.pre('save', function (next) {
  if (!this.transactionId) {
    const randomSuffix = Math.floor(100000 + Math.random() * 900000);
    this.transactionId = `TXN-${randomSuffix}`;
  }
  next();
});

const Transaction = mongoose.model('Transaction', transactionSchema);

module.exports = Transaction;
