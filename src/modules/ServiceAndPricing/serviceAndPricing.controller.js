const catchAsync = require('../../helpers/catchAsync');
const response = require('../../helpers/response');
const { status } = require('http-status');
const {
  createOrUpdateServiceAndPricing,
  getMyServiceAndPricing,
  getInstructorServiceAndPricing,
  addPublicPoolService,
  deletePublicPoolService,
  updatePublicPoolService
} = require('./serviceAndPricing.service');

// Instructor creates or updates service & pricing
const saveServiceAndPricing = catchAsync(async (req, res) => {
  let bodyData = req.body || {};
  if (bodyData && bodyData.data) {
    if (typeof bodyData.data === 'string') {
      try {
        bodyData = JSON.parse(bodyData.data);
      } catch (e) {
        // Keep bodyData
      }
    } else if (typeof bodyData.data === 'object' && bodyData.data !== null) {
      bodyData = bodyData.data;
    }
  }

  const files = req.files || req.file;
  const instructorId = req.User?._id || req.User?.id || req.dbUser?._id;

  const result = await createOrUpdateServiceAndPricing(instructorId, bodyData, files);
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
  const currentUserId = req.User?._id || req.User?.id || req.query.userId || req.headers['x-user-id'] || null;
  const result = await getInstructorServiceAndPricing(req.params.instructorId, currentUserId);
  return res.status(status.OK).json(
    response({
      status: 'OK',
      statusCode: status.OK,
      message: 'Instructor service and pricing fetched successfully',
      data: result
    })
  );
});

// Add a single public pool (Figma: Add pool modal 40012599:4787)
const addPublicPool = catchAsync(async (req, res) => {
  let poolData = req.body || {};
  if (poolData && poolData.data) {
    if (typeof poolData.data === 'string') {
      try {
        poolData = JSON.parse(poolData.data);
      } catch (e) {}
    } else if (typeof poolData.data === 'object' && poolData.data !== null) {
      poolData = poolData.data;
    }
  }

  const instructorId = req.User?._id || req.User?.id || req.dbUser?._id;
  const result = await addPublicPoolService(instructorId, poolData);

  return res.status(status.OK).json(
    response({
      status: 'OK',
      statusCode: status.OK,
      message: 'Public pool added successfully',
      data: result
    })
  );
});

// Delete a public pool (Figma: Cross icon 40012599:4589)
const deletePublicPool = catchAsync(async (req, res) => {
  const instructorId = req.User?._id || req.User?.id || req.dbUser?._id;
  const poolId = req.params.poolId || req.body?.poolId || req.query?.poolId;

  const result = await deletePublicPoolService(instructorId, poolId);

  return res.status(status.OK).json(
    response({
      status: 'OK',
      statusCode: status.OK,
      message: 'Public pool deleted successfully',
      data: result
    })
  );
});

// Update a public pool
const updatePublicPool = catchAsync(async (req, res) => {
  let poolData = req.body || {};
  if (poolData && poolData.data) {
    if (typeof poolData.data === 'string') {
      try {
        poolData = JSON.parse(poolData.data);
      } catch (e) {}
    } else if (typeof poolData.data === 'object' && poolData.data !== null) {
      poolData = poolData.data;
    }
  }

  const instructorId = req.User?._id || req.User?.id || req.dbUser?._id;
  const poolId = req.params.poolId || poolData.poolId || req.query?.poolId;

  const result = await updatePublicPoolService(instructorId, poolId, poolData);

  return res.status(status.OK).json(
    response({
      status: 'OK',
      statusCode: status.OK,
      message: 'Public pool updated successfully',
      data: result
    })
  );
});

module.exports = {
  saveServiceAndPricing,
  getMyService,
  getInstructorService,
  addPublicPool,
  deletePublicPool,
  updatePublicPool
};
