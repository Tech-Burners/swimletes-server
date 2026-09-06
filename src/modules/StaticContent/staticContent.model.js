const mongoose = require('mongoose');

const staticContentSchema = new mongoose.Schema({
  type: { type: String, enum: ['privacy-policy', 'terms-of-condition', 'support', 'about-us', 'cancellation-policy'], default: 'privacy-policy' },
  targetAudience: { type: String, enum: ['user', 'instructor', 'all'], required: false },
  content: { type: String, required: true },
});

module.exports = mongoose.model('StaticContent', staticContentSchema);