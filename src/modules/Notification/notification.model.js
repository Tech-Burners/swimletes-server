const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    message: {
      type: String,
      required: true,
      trim: true
    },
    type: {
      type: String,
      enum: [
        'lesson_review',     // "How was today's lesson?"
        'lesson_reminder',   // "Lesson starts in 1 hour"
        'booking_confirmed', // "Booking confirmed"
        'booking_cancelled', // "Your instructor cancelled" / "Client cancelled"
        'refund_processed',  // "Refund processed"
        'booking_declined',  // "Request declined"
        'chat_message',      // "You have a new message"
        'booking_created',   // "New booking request received"
        'general',
        'system'
      ],
      default: 'general',
      index: true
    },
    icon: {
      type: String,
      default: 'star' // 'star', 'clock', 'check', 'cancel', 'refund', 'message', 'alert'
    },
    iconBg: {
      type: String,
      default: 'rgba(232, 148, 63, 0.2)' // Default warm amber from Figma
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true
    },
    readAt: {
      type: Date,
      default: null
    },
    data: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: true
  }
);

notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, isRead: 1 });

module.exports = mongoose.model('Notification', notificationSchema);
