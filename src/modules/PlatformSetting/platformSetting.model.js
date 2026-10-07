const mongoose = require('mongoose');

const feeHistorySchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['platform_fee', 'instructor_commission'],
    required: true
  },
  previousPercentage: {
    type: Number,
    required: true
  },
  newPercentage: {
    type: Number,
    required: true
  },
  changedBy: {
    type: String,
    default: 'Samantha Archer'
  },
  changedById: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  changedAt: {
    type: Date,
    default: Date.now
  }
});

const platformSettingSchema = new mongoose.Schema({
  settingKey: {
    type: String,
    default: 'global_fees',
    unique: true
  },
  platformFee: {
    percentage: {
      type: Number,
      default: 5,
      min: 0,
      max: 100
    },
    lastChanged: {
      type: Date,
      default: () => new Date('2026-08-07T10:00:00.000Z')
    },
    lastChangedBy: {
      type: String,
      default: 'Samantha Archer'
    }
  },
  instructorCommission: {
    percentage: {
      type: Number,
      default: 15,
      min: 0,
      max: 100
    },
    lastChanged: {
      type: Date,
      default: () => new Date('2026-07-10T10:00:00.000Z')
    },
    lastChangedBy: {
      type: String,
      default: 'Samantha Archer'
    }
  },
  history: [feeHistorySchema]
}, {
  timestamps: true
});

module.exports = mongoose.model('PlatformSetting', platformSettingSchema);
