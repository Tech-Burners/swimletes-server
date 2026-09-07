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

module.exports = {
  getAvailabilityByInstructorId,
  updateAvailabilityService,
  addSlotService,
  removeSlotService,
  toggleDayService
};
