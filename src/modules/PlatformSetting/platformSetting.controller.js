const { default: status } = require('http-status');
const catchAsync = require('../../helpers/catchAsync');
const response = require('../../helpers/response');
const {
  getFeeSettingsService,
  updatePlatformFeeService,
  updateInstructorCommissionService,
  getFeeHistoryService
} = require('./platformSetting.service');

// Get Fee & Commission Settings (Figma 40012563:24404)
const getFeeSettingsController = catchAsync(async (req, res) => {
  const result = await getFeeSettingsService();
  return res.status(status.OK).json(
    response({
      status: 'OK',
      statusCode: status.OK,
      type: 'PlatformFeeSettings',
      message: 'Platform fees and commission settings fetched successfully',
      data: result
    })
  );
});

// Update Platform Fee (Figma 40012563:24404)
const updatePlatformFeeController = catchAsync(async (req, res) => {
  const result = await updatePlatformFeeService(req.body, req.user || {});
  return res.status(status.OK).json(
    response({
      status: 'OK',
      statusCode: status.OK,
      type: 'PlatformFeeUpdate',
      message: 'Platform fee percentage updated successfully',
      data: result
    })
  );
});

// Update Instructor Commission (Figma 40012563:24404)
const updateInstructorCommissionController = catchAsync(async (req, res) => {
  const result = await updateInstructorCommissionService(req.body, req.user || {});
  return res.status(status.OK).json(
    response({
      status: 'OK',
      statusCode: status.OK,
      type: 'InstructorCommissionUpdate',
      message: 'Instructor commission percentage updated successfully',
      data: result
    })
  );
});

// Get Fee or Commission Audit History (Figma 40012563:24707 & 40012563:25010)
const getFeeHistoryController = catchAsync(async (req, res) => {
  const rawType = req.params.type || req.query.type;
  let normalizedType;

  if (rawType) {
    const lower = String(rawType).toLowerCase().replace(/[-_\s]/g, '');
    if (lower.includes('platform') || lower === 'fee') {
      normalizedType = 'platform_fee';
    } else if (lower.includes('instructor') || lower.includes('commission')) {
      normalizedType = 'instructor_commission';
    } else {
      normalizedType = rawType;
    }
  }

  const result = await getFeeHistoryService(normalizedType);
  const message = normalizedType === 'platform_fee'
    ? 'Platform fee audit history fetched successfully'
    : normalizedType === 'instructor_commission'
    ? 'Instructor commission audit history fetched successfully'
    : 'Fee audit history fetched successfully';

  return res.status(status.OK).json(
    response({
      status: 'OK',
      statusCode: status.OK,
      type: 'FeeHistoryList',
      message,
      data: result
    })
  );
});

module.exports = {
  getFeeSettingsController,
  updatePlatformFeeController,
  updateInstructorCommissionController,
  getFeeHistoryController
};
