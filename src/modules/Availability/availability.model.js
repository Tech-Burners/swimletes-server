const mongoose = require('mongoose');

const timeSlotSchema = new mongoose.Schema(
  {
    startTime: {
      type: String, // e.g. "09:00 AM" or "15:00"
      required: true,
      trim: true
    },
    endTime: {
      type: String, // e.g. "10:00 AM" or "16:00"
      required: true,
      trim: true
    }
  },
  { _id: true }
);

const dayScheduleSchema = new mongoose.Schema(
  {
    day: {
      type: String,
      enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
      required: true
    },
    isAvailable: {
      type: Boolean,
      default: false
    },
    slots: [timeSlotSchema]
  },
  { _id: false }
);

const availabilitySchema = new mongoose.Schema(
  {
    instructor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true
    },

    // Weekly recurring schedule (Monday - Sunday)
    weeklySchedule: {
      type: [dayScheduleSchema],
      default: [
        { day: 'monday', isAvailable: true, slots: [{ startTime: '09:00 AM', endTime: '12:00 PM' }, { startTime: '03:00 PM', endTime: '04:00 PM' }] },
        { day: 'tuesday', isAvailable: true, slots: [{ startTime: '09:00 AM', endTime: '12:00 PM' }] },
        { day: 'wednesday', isAvailable: false, slots: [] },
        { day: 'thursday', isAvailable: true, slots: [{ startTime: '09:00 AM', endTime: '12:00 PM' }] },
        { day: 'friday', isAvailable: false, slots: [] },
        { day: 'saturday', isAvailable: true, slots: [{ startTime: '09:00 AM', endTime: '02:00 PM' }] },
        { day: 'sunday', isAvailable: false, slots: [] }
      ]
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('Availability', availabilitySchema);
