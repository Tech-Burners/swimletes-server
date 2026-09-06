 const mongoose = require('mongoose');

const favouriteSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    service: { type: mongoose.Schema.Types.ObjectId, ref: 'Service' },
}, { timestamps: true });

module.exports = mongoose.model('Favourite', favouriteSchema);