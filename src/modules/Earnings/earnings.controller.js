const catchAsync = require('../../helpers/catchAsync');
const response = require('../../helpers/response');
const { status } = require('http-status');
const {
  getInstructorEarningsOverviewService,
  getInstructorTransactionsHistoryService,
  requestWithdrawalService,
  getAdminPendingWithdrawalsService,
  getAdminWithdrawalHistoryService,
  getAdminWithdrawalDetailsService,
  adminActionWithdrawalService,
  getAdminPlatformEarningsOverviewService,
  getAdminPlatformTransactionsService,
  getBankAccountService,
  saveBankAccountService,
  deleteBankAccountService
} = require('./earnings.service');

/**
 * 1. Get Instructor Earnings Overview Screen Data (Figma Node 40012419:6929)
 */
const getInstructorEarningsOverview = catchAsync(async (req, res) => {
  const instructorId = req.query.instructorId || req.User._id;
  const { month, year } = req.query;
  const result = await getInstructorEarningsOverviewService(instructorId, month, year);

  return res.status(status.OK).json(
    response({
      status: 'OK',
      statusCode: status.OK,
      message: 'Instructor earnings overview fetched successfully',
      data: result
    })
  );
});

/**
 * 2. Get Instructor Transactions History Screen Data (Figma Node 40012438:8506)
 */
const getInstructorTransactionsHistory = catchAsync(async (req, res) => {
  const instructorId = req.query.instructorId || req.User._id;
  const result = await getInstructorTransactionsHistoryService(instructorId, req.query);

  return res.status(status.OK).json(
    response({
      status: 'OK',
      statusCode: status.OK,
      message: 'Instructor transactions history fetched successfully',
      data: result
    })
  );
});

/**
 * 3. Request Withdrawal
 */
const requestWithdrawal = catchAsync(async (req, res) => {
  const instructorId = req.User._id;
  const result = await requestWithdrawalService(instructorId, req.body);

  return res.status(status.CREATED).json(
    response({
      status: 'OK',
      statusCode: status.CREATED,
      message: 'Withdrawal request submitted successfully',
      data: result
    })
  );
});

/**
 * 4. Admin - Get Pending Withdrawals (Figma Node 40012563:21572)
 */
const getAdminPendingWithdrawals = catchAsync(async (req, res) => {
  const result = await getAdminPendingWithdrawalsService(req.query);

  return res.status(status.OK).json(
    response({
      status: 'OK',
      statusCode: status.OK,
      message: 'Pending withdrawals fetched successfully',
      data: result
    })
  );
});

/**
 * 5. Admin - Get Withdrawal History (Figma Node 40012563:22328)
 */
const getAdminWithdrawalHistory = catchAsync(async (req, res) => {
  const result = await getAdminWithdrawalHistoryService(req.query);

  return res.status(status.OK).json(
    response({
      status: 'OK',
      statusCode: status.OK,
      message: 'Withdrawal history fetched successfully',
      data: result
    })
  );
});

/**
 * 6. Admin - Get Withdrawal Details by ID
 */
const getAdminWithdrawalDetails = catchAsync(async (req, res) => {
  const result = await getAdminWithdrawalDetailsService(req.params.id);

  return res.status(status.OK).json(
    response({
      status: 'OK',
      statusCode: status.OK,
      message: 'Withdrawal details fetched successfully',
      data: result
    })
  );
});

/**
 * 7. Admin - Action Withdrawal (Approve / Reject)
 */
const adminActionWithdrawal = catchAsync(async (req, res) => {
  const { id } = req.params;
  const action = req.params.action || req.body.action || (req.path.includes('approve') ? 'approve' : 'reject');
  const result = await adminActionWithdrawalService(id, action, req.body, req.User?._id);

  return res.status(status.OK).json(
    response({
      status: 'OK',
      statusCode: status.OK,
      message: result.message,
      data: result
    })
  );
});

/**
 * 8. Admin - Get Platform Earnings Overview & Chart (Figma Node 40012563:22986)
 */
const getAdminPlatformEarningsOverview = catchAsync(async (req, res) => {
  const result = await getAdminPlatformEarningsOverviewService(req.query.year);

  return res.status(status.OK).json(
    response({
      status: 'OK',
      statusCode: status.OK,
      message: 'Platform earnings overview fetched successfully',
      data: result
    })
  );
});

/**
 * 9. Admin - Get Platform Transaction Breakdown (Figma Node 40012563:22986)
 */
const getAdminPlatformTransactions = catchAsync(async (req, res) => {
  const result = await getAdminPlatformTransactionsService(req.query);

  return res.status(status.OK).json(
    response({
      status: 'OK',
      statusCode: status.OK,
      message: 'Platform transaction breakdown fetched successfully',
      data: result
    })
  );
});

/**
 * 10. Get Bank Account Details (Figma Node 40012508:6741)
 */
const getBankAccount = catchAsync(async (req, res) => {
  const targetUserId = req.query.userId || req.query.instructorId || req.User?._id || req.user?._id;
  const result = await getBankAccountService(targetUserId);

  return res.status(status.OK).json(
    response({
      status: 'OK',
      statusCode: status.OK,
      message: 'Bank account details fetched successfully',
      data: result
    })
  );
});

/**
 * 11. Save / Update Bank Account Details (Figma Node 40012508:6741)
 */
const saveBankAccount = catchAsync(async (req, res) => {
  const userId = req.User?._id || req.user?._id;
  const result = await saveBankAccountService(userId, req.body);

  return res.status(status.OK).json(
    response({
      status: 'OK',
      statusCode: status.OK,
      message: result.message || 'Bank account saved successfully',
      data: result.bankAccount
    })
  );
});

/**
 * 12. Delete / Reset Bank Account Details (Figma Node 40012508:6741)
 */
const deleteBankAccount = catchAsync(async (req, res) => {
  const userId = req.User?._id || req.user?._id;
  const result = await deleteBankAccountService(userId);

  return res.status(status.OK).json(
    response({
      status: 'OK',
      statusCode: status.OK,
      message: result.message || 'Bank account removed successfully',
      data: null
    })
  );
});

module.exports = {
  getInstructorEarningsOverview,
  getInstructorTransactionsHistory,
  requestWithdrawal,
  getAdminPendingWithdrawals,
  getAdminWithdrawalHistory,
  getAdminWithdrawalDetails,
  adminActionWithdrawal,
  getAdminPlatformEarningsOverview,
  getAdminPlatformTransactions,
  getBankAccount,
  saveBankAccount,
  deleteBankAccount
};

