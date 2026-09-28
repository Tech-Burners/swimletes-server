const Availability = require('./availability.model');
const ApiError = require('../../helpers/ApiError');
const { status: httpStatus } = require('http-status');
const {
  timeStringToMinutes,
  resolveEndTime,
  isTimeOverlapping,
  validateTimeRange,
  findOverlappingSlot,
  validateSlotsSchedule
} = require('../../helpers/timeHelper');

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
  // Validate that no slots overlap / collapse within any day's schedule
  if (payload.weeklySchedule && Array.isArray(payload.weeklySchedule)) {
    for (const dayItem of payload.weeklySchedule) {
      if (dayItem.slots && Array.isArray(dayItem.slots) && dayItem.slots.length > 0) {
        validateSlotsSchedule(dayItem.slots, dayItem.day);
      }
    }
  }

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
  if (!slotData || !slotData.startTime || !slotData.endTime) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Both startTime and endTime are required for the time slot');
  }

  // 1. Validate time format and order (start must be before end)
  validateTimeRange(slotData.startTime, slotData.endTime);

  let availability = await getAvailabilityByInstructorId(instructorId);
  const daySchedule = availability.weeklySchedule.find(
    (item) => item.day.toLowerCase() === day.toLowerCase()
  );

  if (!daySchedule) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Day ${day} not found in schedule`);
  }

  // 2. Check if new slot overlaps / collapses with any existing slot on this day
  const conflictingSlot = findOverlappingSlot(slotData, daySchedule.slots || []);
  if (conflictingSlot) {
    throw new ApiError(
      httpStatus.CONFLICT,
      `Time slot ${slotData.startTime} – ${slotData.endTime} overlaps with existing slot ${conflictingSlot.startTime} – ${conflictingSlot.endTime} on ${day}. Time slots cannot collapse.`
    );
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
 * Get instructor date-specific slots, 7-day availability strip, and full month calendar (matching Figma Screens 40012130:6834 & 40012146:718)
 */
const getInstructorSlotsService = async (instructorId, queryDate, queryMonth) => {
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

  // 1. Fetch bookings for selected date to compute isBooked per slot
  const startOfDay = new Date(targetDate);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(targetDate);
  endOfDay.setHours(23, 59, 59, 999);

  const existingBookings = await Booking.find({
    instructor: instructorId,
    date: { $gte: startOfDay, $lte: endOfDay },
    status: { $in: ['pending', 'accepted', 'active'] },
    'payment.status': 'paid'
  });

  // 2. Mark individual slots with isBooked by checking if any booking overlaps with the slot
  const slots = (daySchedule?.slots || []).map((slot) => {
    const isBooked = existingBookings.some((b) => {
      const bEndTime = resolveEndTime(b.startTime, b.endTime, b.duration);
      return isTimeOverlapping(slot.startTime, slot.endTime, b.startTime, bEndTime);
    });
    return {
      _id: slot._id,
      startTime: slot.startTime,
      endTime: slot.endTime,
      isBooked: isBooked
    };
  });

  // 3. Build 7-day calendar strip with accurate booked slot subtraction (Figma Screen 40012130:6834)
  const stripStart = new Date(targetDate);
  stripStart.setHours(0, 0, 0, 0);
  const stripEnd = new Date(targetDate);
  stripEnd.setDate(stripEnd.getDate() + 7);
  stripEnd.setHours(23, 59, 59, 999);

  const stripBookings = await Booking.find({
    instructor: instructorId,
    date: { $gte: stripStart, $lte: stripEnd },
    status: { $in: ['pending', 'accepted', 'active'] },
    'payment.status': 'paid'
  });

  const calendarWeek = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(targetDate);
    d.setDate(d.getDate() + i);
    const dDayName = daysOfWeek[d.getDay()];
    const dDayShort = dayShortNames[d.getDay()];
    const dDaySchedule = availability.weeklySchedule.find(
      (item) => item.day.toLowerCase() === dDayName.toLowerCase()
    );

    const isDayEnabled = dDaySchedule?.isAvailable && (dDaySchedule.slots?.length || 0) > 0;
    const totalDaySlots = dDaySchedule?.slots?.length || 0;

    // Filter bookings on this specific day
    const dDateStr = d.toISOString().split('T')[0];
    const bookingsOnDate = stripBookings.filter((b) => {
      const bDateStr = b.date ? new Date(b.date).toISOString().split('T')[0] : '';
      return bDateStr === dDateStr;
    });

    const daySlots = dDaySchedule?.slots || [];
    const bookedSlotsCount = daySlots.filter((slot) => {
      return bookingsOnDate.some((b) => {
        const bEndTime = resolveEndTime(b.startTime, b.endTime, b.duration);
        return isTimeOverlapping(slot.startTime, slot.endTime, b.startTime, bEndTime);
      });
    }).length;

    const remainingOpenSlots = Math.max(0, totalDaySlots - bookedSlotsCount);

    let status = 'closed';
    let statusText = 'closed';

    if (!isDayEnabled || totalDaySlots === 0) {
      status = 'pool_closed';
      statusText = 'closed';
    } else if (remainingOpenSlots === 0) {
      status = 'fully_booked';
      statusText = 'full';
    } else {
      status = 'open';
      statusText = `${remainingOpenSlots} open`;
    }

    calendarWeek.push({
      date: dDateStr,
      dayName: dDayName,
      dayShort: dDayShort,
      dayNumber: d.getDate(),
      isAvailable: isDayEnabled && remainingOpenSlots > 0,
      totalSlots: totalDaySlots,
      openSlots: remainingOpenSlots,
      status,
      statusText
    });
  }

  // 4. Monthly Calendar Grid (Figma Screen 40012146:718)
  let calendarMonth = null;
  const targetMonthStr = queryMonth || (queryDate ? queryDate.substring(0, 7) : null);
  if (targetMonthStr && targetMonthStr.match(/^\d{4}-\d{2}$/)) {
    const [year, month] = targetMonthStr.split('-').map(Number);
    const monthStart = new Date(year, month - 1, 1, 0, 0, 0, 0);
    const monthEnd = new Date(year, month, 0, 23, 59, 59, 999);
    const totalDaysInMonth = monthEnd.getDate();

    const monthBookings = await Booking.find({
      instructor: instructorId,
      date: { $gte: monthStart, $lte: monthEnd },
      status: { $in: ['pending', 'accepted', 'active'] },
      'payment.status': 'paid'
    });

    calendarMonth = [];
    const selectedDateStr = targetDate.toISOString().split('T')[0];

    for (let dayNum = 1; dayNum <= totalDaysInMonth; dayNum++) {
      const d = new Date(year, month - 1, dayNum);
      const dDateStr = d.toISOString().split('T')[0];
      const dDayName = daysOfWeek[d.getDay()];
      const dDayShort = dayShortNames[d.getDay()];
      const dDaySchedule = availability.weeklySchedule.find(
        (item) => item.day.toLowerCase() === dDayName.toLowerCase()
      );

      const isDayEnabled = dDaySchedule?.isAvailable && (dDaySchedule.slots?.length || 0) > 0;
      const totalDaySlots = dDaySchedule?.slots?.length || 0;

      const bookingsOnDay = monthBookings.filter((b) => {
        const bDateStr = b.date ? new Date(b.date).toISOString().split('T')[0] : '';
        return bDateStr === dDateStr;
      });

      const daySlots = dDaySchedule?.slots || [];
      const bookedOnDayCount = daySlots.filter((slot) => {
        return bookingsOnDay.some((b) => {
          const bEndTime = resolveEndTime(b.startTime, b.endTime, b.duration);
          return isTimeOverlapping(slot.startTime, slot.endTime, b.startTime, bEndTime);
        });
      }).length;

      const remainingSlots = Math.max(0, totalDaySlots - bookedOnDayCount);
      let dayState = 'open'; // 'chosen', 'open', 'fully_booked', 'pool_closed'

      if (dDateStr === selectedDateStr) {
        dayState = 'chosen';
      } else if (!isDayEnabled || totalDaySlots === 0) {
        dayState = 'pool_closed';
      } else if (remainingSlots === 0) {
        dayState = 'fully_booked';
      } else {
        dayState = 'open';
      }

      calendarMonth.push({
        date: dDateStr,
        dayNumber: dayNum,
        dayShort: dDayShort,
        status: dayState,
        isOpen: isDayEnabled && remainingSlots > 0,
        openSlots: remainingSlots
      });
    }
  }

  return {
    instructorId,
    selectedDate: targetDate.toISOString().split('T')[0],
    selectedDay: selectedDayName,
    isAvailable: daySchedule?.isAvailable || false,
    slots,
    calendarWeek,
    ...(calendarMonth ? { calendarMonth } : {})
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
