const catchAsync = require('../../helpers/catchAsync');
const response = require('../../helpers/response');
const { status } = require('http-status');
const {
  getAdminRefundsLedgerService,
  getAdminRefundDetailsService,
  issueAdminManualRefundService
} = require('./refund.service');

/**
 * 1. Admin - Get Refunds Ledger (Figma Node 40012554:21158)
 */
const getAdminRefundsLedger = catchAsync(async (req, res) => {
  const result = await getAdminRefundsLedgerService(req.query);

  return res.status(status.OK).json(
    response({
      status: 'OK',
      statusCode: status.OK,
      message: 'Refunds ledger fetched successfully',
      data: result
    })
  );
});

/**
 * 2. Admin - Get Refund Details by ID
 */
const getAdminRefundDetails = catchAsync(async (req, res) => {
  const result = await getAdminRefundDetailsService(req.params.id);

  return res.status(status.OK).json(
    response({
      status: 'OK',
      statusCode: status.OK,
      message: 'Refund details fetched successfully',
      data: result
    })
  );
});

/**
 * 3. Admin - Issue Manual Refund (Figma Node 40012554:21158)
 */
const issueAdminManualRefund = catchAsync(async (req, res) => {
  const result = await issueAdminManualRefundService(req.body, req.User?._id);

  return res.status(status.CREATED).json(
    response({
      status: 'OK',
      statusCode: status.CREATED,
      message: 'Refund issued successfully',
      data: result
    })
  );
});

module.exports = {
  getAdminRefundsLedger,
  getAdminRefundDetails,
  issueAdminManualRefund
};
