const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      default: 'Report'
    },
    reporterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    reportedId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      required: true
    },
    reason: {
      type: String,
      default: ''
    },
    description: {
      type: String,
      required: true
    },
    image: {
      type: String,
      default: ''
    },
    images: [{ type: String }],
    status: {
      type: String,
      enum: ['open', 'resolved', 'dismissed'],
      default: 'open'
    },
    isResolved: {
      type: Boolean,
      default: false
    }
  },
  { timestamps: true }
);

const Report = mongoose.model('Report', reportSchema);

module.exports = Report;
