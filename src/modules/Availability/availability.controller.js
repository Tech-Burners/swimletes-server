const catchAsync = require('../../helpers/catchAsync');
const response = require('../../helpers/response');
const { status } = require('http-status');
const {
  getAvailabilityByInstructorId,
  updateAvailabilityService,
  addSlotService,
  removeSlotService,
  toggleDayService
} = require('./availability.service');

// Get my availability (logged in instructor)
const getMyAvailability = catchAsync(async (req, res) => {
  const result = await getAvailabilityByInstructorId(req.User._id);
  return res.status(status.OK).json(
    response({
      status: 'OK',
      statusCode: status.OK,
      message: 'Availability fetched successfully',
      data: result
    })
  );
});

// Get instructor availability by ID (public / client view)
const getInstructorAvailability = catchAsync(async (req, res) => {
  const result = await getAvailabilityByInstructorId(req.params.instructorId);
  return res.status(status.OK).json(
    response({
      status: 'OK',
      statusCode: status.OK,
      message: 'Instructor availability fetched successfully',
      data: result
    })
  );
});

// Update full schedule
const updateAvailability = catchAsync(async (req, res) => {
  const result = await updateAvailabilityService(req.User._id, req.body);
  return res.status(status.OK).json(
    response({
      status: 'OK',
      statusCode: status.OK,
      message: 'Availability updated successfully',
      data: result
    })
  );
});

// Add a time slot
const addTimeSlot = catchAsync(async (req, res) => {
  const { day, startTime, endTime } = req.body;
  const result = await addSlotService(req.User._id, day, { startTime, endTime });
  return res.status(status.CREATED).json(
    response({
      status: 'OK',
      statusCode: status.CREATED,
      message: 'Time slot added successfully',
      data: result
    })
  );
});

// Remove a time slot
const removeTimeSlot = catchAsync(async (req, res) => {
  const { day, slotId } = req.params;
  const result = await removeSlotService(req.User._id, day, slotId);
  return res.status(status.OK).json(
    response({
      status: 'OK',
      statusCode: status.OK,
      message: 'Time slot removed successfully',
      data: result
    })
  );
});

// Toggle day availability
const toggleDayAvailability = catchAsync(async (req, res) => {
  const { day, isAvailable } = req.body;
  const result = await toggleDayService(req.User._id, day, isAvailable);
  return res.status(status.OK).json(
    response({
      status: 'OK',
      statusCode: status.OK,
      message: `Availability for ${day} updated successfully`,
      data: result
    })
  );
});

module.exports = {
  getMyAvailability,
  getInstructorAvailability,
  updateAvailability,
  addTimeSlot,
  removeTimeSlot,
  toggleDayAvailability
};
