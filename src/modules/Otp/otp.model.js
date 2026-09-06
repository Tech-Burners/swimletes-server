const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema({
  sentTo: {type: String, required: false},
  receiverType: { type: String, enum: ['email', 'phone'], default: 'email' },
  purpose: { type: String, enum: ['email-verification', 'forget-password'], default: 'email-verification' },
  otp: { type: String, required: [true, 'OTP must be given'], trim: true },
  expiredAt: { type: Date, required: [true, 'ExpiredAt must be given'], trim: true },
  verifiedAt: { type: Date, required: false, trim: true },
  status: { type: String, enum: ['verified', 'pending', 'expired'], default: 'pending' },
}, {
  timestamps: true
});

otpSchema.index({ expiredAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('OTP', otpSchema);
