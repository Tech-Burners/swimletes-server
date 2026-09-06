const catchAsync = require('../../helpers/catchAsync');
const response = require('../../helpers/response');
const { status } = require('http-status');
const {
  createOrUpdateServiceAndPricing,
  getMyServiceAndPricing,
  getInstructorServiceAndPricing
} = require('./serviceAndPricing.service');

// Instructor creates or updates service & pricing
const saveServiceAndPricing = catchAsync(async (req, res) => {
  const result = await createOrUpdateServiceAndPricing(req.User._id, req.body);
  return res.status(status.OK).json(
    response({
      status: 'OK',
      statusCode: status.OK,
      message: 'Service and pricing saved successfully',
      data: result
    })
  );
});

// Instructor views own service & pricing
const getMyService = catchAsync(async (req, res) => {
  const result = await getMyServiceAndPricing(req.User._id);
  return res.status(status.OK).json(
    response({
      status: 'OK',
      statusCode: status.OK,
      message: 'Service and pricing fetched successfully',
      data: result
    })
  );
});

// Public: View instructor's service & pricing
const getInstructorService = catchAsync(async (req, res) => {
  const result = await getInstructorServiceAndPricing(req.params.instructorId);
  return res.status(status.OK).json(
    response({
      status: 'OK',
      statusCode: status.OK,
      message: 'Instructor service and pricing fetched successfully',
      data: result
    })
  );
});

module.exports = {
  saveServiceAndPricing,
  getMyService,
  getInstructorService
};
