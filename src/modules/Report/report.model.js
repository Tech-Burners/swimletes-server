const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema(
  {
    // 1. Booking Reference & Cached ID (e.g. BK-88214)
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      required: [true, 'Booking reference is required'],
      index: true
    },
    bookingId: {
      type: String,
      required: true,
      trim: true,
      index: true
    },

    // 2. Who is filing the report
    reporter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Reporter reference is required'],
      index: true
    },
    reporterRole: {
      type: String,
      enum: ['user', 'instructor', 'admin'],
      required: true
    },

    // 3. Parties involved in the lesson
    client: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Client reference is required'],
      index: true
    },
    instructor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Instructor reference is required'],
      index: true
    },

    // 4. Dispute / Issue details (Figma 40012392:3369 & 40012554:20832)
    reason: {
      type: String,
      required: [true, 'Dispute reason is required'],
      trim: true
    },
    details: {
      type: String,
      trim: true,
      default: '' // "Add any details help us look into this"
    },
    photos: [
      {
        type: String,
        trim: true
      }
    ],
    files: [
      {
        type: String,
        trim: true
      }
    ],


    // 5. Booking financial & schedule snapshot
    amount: {
      type: Number,
      default: 0
    },
    lessonDate: {
      type: Date
    },

    // 6. Dispute Resolution Status
    status: {
      type: String,
      enum: ['open', 'resolved', 'dismissed'],
      default: 'open',
      index: true
    },

    // 7. Admin resolution outcome details
    resolution: {
      action: {
        type: String,
        enum: ['none', 'dismissed', 'resolved_no_action', 'refunded', 'warning_issued', 'custom'],
        default: 'none'
      },
      notes: {
        type: String,
        trim: true,
        default: ''
      },
      resolvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      resolvedAt: {
        type: Date
      }
    }
  },
  {
    timestamps: true
  }
);

// Indexes for fast lookup
reportSchema.index({ status: 1, createdAt: -1 });
reportSchema.index({ client: 1, createdAt: -1 });
reportSchema.index({ instructor: 1, createdAt: -1 });
reportSchema.index({ reporter: 1, booking: 1 });

module.exports = mongoose.model('Report', reportSchema);
