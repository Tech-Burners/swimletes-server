const catchAsync = require('../../helpers/catchAsync');
const {
  createReportService,
  getAdminDisputesService,
  getAdminDisputeDetailsService,
  resolveDisputeService,
  getMyReportsService
} = require('./report.service');
const response = require('../../helpers/response');
const { default: status } = require('http-status');

const createReportController = catchAsync(async (req, res) => {
  const files = req.files || (req.file ? [req.file] : []);
  const result = await createReportService(req.User._id, req.body, files);
  return res.status(status.CREATED).json(
    response({
      status: 'OK',
      statusCode: status.CREATED,
      type: 'Report',
      message: 'Report submitted successfully',
      data: result
    })
  );
});

const getAdminDisputesController = catchAsync(async (req, res) => {
  const result = await getAdminDisputesService(req.query);
  return res.status(status.OK).json(
    response({
      status: 'OK',
      statusCode: status.OK,
      type: 'Disputes',
      message: 'Disputes fetched successfully',
      data: result
    })
  );
});

const getAdminDisputeDetailsController = catchAsync(async (req, res) => {
  const result = await getAdminDisputeDetailsService(req.params.id);
  return res.status(status.OK).json(
    response({
      status: 'OK',
      statusCode: status.OK,
      type: 'Dispute',
      message: 'Dispute details fetched successfully',
      data: result
    })
  );
});

const resolveDisputeController = catchAsync(async (req, res) => {
  const result = await resolveDisputeService(req.params.id, req.User._id, req.body);
  return res.status(status.OK).json(
    response({
      status: 'OK',
      statusCode: status.OK,
      type: 'Dispute',
      message: `Dispute ${result.status} successfully`,
      data: result
    })
  );
});

const getMyReportsController = catchAsync(async (req, res) => {
  const result = await getMyReportsService(req.User._id, req.query);
  return res.status(status.OK).json(
    response({
      status: 'OK',
      statusCode: status.OK,
      type: 'Reports',
      message: 'User reports fetched successfully',
      data: result
    })
  );
});

module.exports = {
  createReportController,
  getAdminDisputesController,
  getAdminDisputeDetailsController,
  resolveDisputeController,
  getMyReportsController
};