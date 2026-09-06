const mongoose = require('mongoose');

const tokenSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  passcodeToken: { type: String, required: true },
  purpose: { type: String, required: true },
}, { timestamps: true }
);

module.exports = mongoose.model('Token', tokenSchema);