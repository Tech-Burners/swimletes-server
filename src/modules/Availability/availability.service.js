const Availability = require('./availability.model');
const ApiError = require('../../helpers/ApiError');
const httpStatus = require('http-status');

const defaultWeeklySchedule = [
  { day: 'monday', isAvailable: true, slots: [{ startTime: '09:00 AM', endTime: '12:00 PM' }, { startTime: '03:00 PM', endTime: '04:00 PM' }] },
  { day: 'tuesday', isAvailable: true, slots: [{ startTime: '09:00 AM', endTime: '12:00 PM' }] },
  { day: 'wednesday', isAvailable: false, slots: [] },
  { day: 'thursday', isAvailable: true, slots: [{ startTime: '09:00 AM', endTime: '12:00 PM' }] },
  { day: 'friday', isAvailable: false, slots: [] },
  { day: 'saturday', isAvailable: true, slots: [{ startTime: '09:00 AM', endTime: '02:00 PM' }] },
  { day: 'sunday', isAvailable: false, slots: [] }
];

const getAvailabilityByInstructorId = async (instructorId) => {
  let availability = await Availability.findOne({ instructor: instructorId });
  if (!availability) {
    availability = await Availability.create({
      instructor: instructorId,
      weeklySchedule: defaultWeeklySchedule
    });
  }
  return availability;
};

const updateAvailabilityService = async (instructorId, payload) => {
  let availability = await Availability.findOne({ instructor: instructorId });
  if (!availability) {
    availability = new Availability({
      instructor: instructorId,
      ...payload
    });
  } else {
    if (payload.weeklySchedule) availability.weeklySchedule = payload.weeklySchedule;
  }
  await availability.save();
  return availability;
};

const addSlotService = async (instructorId, day, slotData) => {
  let availability = await getAvailabilityByInstructorId(instructorId);
  const daySchedule = availability.weeklySchedule.find(
    (item) => item.day.toLowerCase() === day.toLowerCase()
  );

  if (!daySchedule) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Day ${day} not found in schedule`);
  }

  daySchedule.slots.push(slotData);
  daySchedule.isAvailable = true;
  await availability.save();
  return availability;
};

const removeSlotService = async (instructorId, day, slotId) => {
  let availability = await getAvailabilityByInstructorId(instructorId);
  const daySchedule = availability.weeklySchedule.find(
    (item) => item.day.toLowerCase() === day.toLowerCase()
  );

  if (!daySchedule) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Day ${day} not found in schedule`);
  }

  daySchedule.slots = daySchedule.slots.filter(
    (slot) => slot._id.toString() !== slotId
  );

  await availability.save();
  return availability;
};

const toggleDayService = async (instructorId, day, isAvailable) => {
  let availability = await getAvailabilityByInstructorId(instructorId);
  const daySchedule = availability.weeklySchedule.find(
    (item) => item.day.toLowerCase() === day.toLowerCase()
  );

  if (!daySchedule) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Day ${day} not found in schedule`);
  }

  daySchedule.isAvailable = isAvailable;
  await availability.save();
  return availability;
};

/**
 * Get instructor date-specific slots and 7-day availability view (matching Figma Availability tab)
 */
const getInstructorSlotsService = async (instructorId, queryDate) => {
  const Booking = require('../Booking/booking.model');
  const availability = await getAvailabilityByInstructorId(instructorId);

  const targetDate = queryDate ? new Date(queryDate) : new Date();
  if (isNaN(targetDate.getTime())) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid date format. Use YYYY-MM-DD');
  }

  const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayShortNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

  const selectedDayName = daysOfWeek[targetDate.getDay()];
  const daySchedule = availability.weeklySchedule.find(
    (item) => item.day.toLowerCase() === selectedDayName.toLowerCase()
  );

  // 1. Fetch bookings for selected date
  const startOfDay = new Date(targetDate);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(targetDate);
  endOfDay.setHours(23, 59, 59, 999);

  const existingBookings = await Booking.find({
    instructor: instructorId,
    date: { $gte: startOfDay, $lte: endOfDay },
    status: { $in: ['pending', 'accepted', 'active', 'completed'] }
  });

  const bookedStartTimes = new Set(existingBookings.map((b) => b.startTime));

  // 2. Mark slots with isBooked
  const slots = (daySchedule?.slots || []).map((slot) => {
    const isBooked = bookedStartTimes.has(slot.startTime);
    return {
      _id: slot._id,
      startTime: slot.startTime,
      endTime: slot.endTime,
      isBooked: isBooked
    };
  });

  // 3. Build 7-day calendar strip
  const calendarWeek = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(targetDate);
    d.setDate(d.getDate() + i);
    const dDayName = daysOfWeek[d.getDay()];
    const dDayShort = dayShortNames[d.getDay()];
    const dDaySchedule = availability.weeklySchedule.find(
      (item) => item.day.toLowerCase() === dDayName.toLowerCase()
    );

    const isDayAvail = dDaySchedule?.isAvailable && (dDaySchedule.slots?.length || 0) > 0;
    const totalDaySlots = dDaySchedule?.slots?.length || 0;

    let statusText = 'closed';
    if (isDayAvail) {
      statusText = `${totalDaySlots} open`;
    }

    calendarWeek.push({
      date: d.toISOString().split('T')[0],
      dayName: dDayName,
      dayShort: dDayShort,
      dayNumber: d.getDate(),
      isAvailable: isDayAvail,
      totalSlots: totalDaySlots,
      statusText: statusText
    });
  }

  return {
    instructorId,
    selectedDate: targetDate.toISOString().split('T')[0],
    selectedDay: selectedDayName,
    isAvailable: daySchedule?.isAvailable || false,
    slots,
    calendarWeek
  };
};

module.exports = {
  getAvailabilityByInstructorId,
  updateAvailabilityService,
  addSlotService,
  removeSlotService,
  toggleDayService,
  getInstructorSlotsService
};
