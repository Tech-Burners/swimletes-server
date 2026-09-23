const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    chatId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Chat',
      required: true,
      index: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    text: {
      type: String,
      default: '',
      trim: true,
    },
    images: [
      {
        type: String,
        default: '',
      }
    ],
    files: [
      {
        url: { type: String, default: '' },
        name: { type: String, default: '' },
        size: { type: Number, default: 0 },
        mimeType: { type: String, default: '' },
      }
    ],
    voice: {
      type: String,
      default: '',
    },
    messageType: {
      type: String,
      enum: ['text', 'image', 'file', 'voice', 'booking_card', 'system'],
      default: 'text',
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    readAt: {
      type: Date,
      default: null,
    },
    isDelivered: {
      type: Boolean,
      default: true,
    },
    deliveredAt: {
      type: Date,
      default: Date.now,
    },
    replyTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

messageSchema.index({ chatId: 1, createdAt: 1 });

module.exports = mongoose.model('Message', messageSchema);
