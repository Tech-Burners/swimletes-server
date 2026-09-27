const catchAsync = require('../../helpers/catchAsync');
const response = require('../../helpers/response');
const { status } = require('http-status');
const {
  createReportService,
  getAdminDisputesListService,
  getAdminDisputeDetailsService,
  adminResolveDisputeService,
  getMyReportsService
} = require('./report.service');

// 1. File a report / dispute on a lesson (Figma 40012392:3369)
const createReport = catchAsync(async (req, res) => {
  let bodyData = req.body || {};
  if (bodyData && bodyData.data) {
    if (typeof bodyData.data === 'string') {
      try {
        bodyData = JSON.parse(bodyData.data);
      } catch (e) {
        // keep bodyData
      }
    } else if (typeof bodyData.data === 'object' && bodyData.data !== null) {
      bodyData = bodyData.data;
    }
  }

  const userId = req.User?._id || bodyData.userId;
  const userRole = req.User?.role || bodyData.role || 'user';
  const files = req.files || req.file;

  const result = await createReportService(userId, userRole, bodyData, files);

  return res.status(status.CREATED).json(
    response({
      status: 'OK',
      statusCode: status.CREATED,
      type: 'DisputeReport',
      message: 'Report submitted successfully. Our team will review this booking.',
      data: result
    })
  );
});

// 2. Admin: Get Disputes List with tab counts (Figma 40012554:20231)
const getAdminDisputesList = catchAsync(async (req, res) => {
  const result = await getAdminDisputesListService(req.query);

  return res.status(status.OK).json(
    response({
      status: 'OK',
      statusCode: status.OK,
      type: 'AdminDisputes',
      message: 'Admin disputes list fetched successfully',
      data: result
    })
  );
});

// 3. Admin: Get Dispute Details for Drawer (Figma 40012554:20832)
const getAdminDisputeDetails = catchAsync(async (req, res) => {
  const disputeId = req.params.id;
  const result = await getAdminDisputeDetailsService(disputeId);

  return res.status(status.OK).json(
    response({
      status: 'OK',
      statusCode: status.OK,
      type: 'AdminDisputeDetails',
      message: 'Dispute details fetched successfully',
      data: result
    })
  );
});

// 4. Admin: Resolve or Dismiss a dispute
const resolveDispute = catchAsync(async (req, res) => {
  const disputeId = req.params.id;
  const adminId = req.User?._id;
  const result = await adminResolveDisputeService(disputeId, adminId, req.body);

  return res.status(status.OK).json(
    response({
      status: 'OK',
      statusCode: status.OK,
      type: 'DisputeResolution',
      message: 'Dispute updated successfully',
      data: result
    })
  );
});

// 5. My Reports (Client or Instructor)
const getMyReports = catchAsync(async (req, res) => {
  const userId = req.User?._id;
  const result = await getMyReportsService(userId, req.query);

  return res.status(status.OK).json(
    response({
      status: 'OK',
      statusCode: status.OK,
      type: 'MyReports',
      message: 'My reports fetched successfully',
      data: result
    })
  );
});

module.exports = {
  createReport,
  getAdminDisputesList,
  getAdminDisputeDetails,
  resolveDispute,
  getMyReports
};
