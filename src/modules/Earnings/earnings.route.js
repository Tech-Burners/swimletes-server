const express = require('express');
const router = express.Router();
const { auth } = require('../../middlewares/auth');
const {
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
} = require('./earnings.controller');

// ==================== 1. Admin Platform Earnings (Figma Node 40012563:22986) ====================
router.get('/admin/overview', auth(['admin']), getAdminPlatformEarningsOverview);
router.get('/admin/transactions', auth(['admin']), getAdminPlatformTransactions);
router.get('/admin/breakdown', auth(['admin']), getAdminPlatformTransactions);
router.get('/admin', auth(['admin']), getAdminPlatformEarningsOverview);

// ==================== 2. Admin Withdrawals (Figma Nodes 40012563:21572 & 40012563:22328) ====================
router.get('/admin/withdrawals/pending', auth(['admin']), getAdminPendingWithdrawals);
router.get('/admin/withdrawals/history', auth(['admin']), getAdminWithdrawalHistory);
router.get('/admin/withdrawals/:id', auth(['admin']), getAdminWithdrawalDetails);
router.patch('/admin/withdrawals/:id/action', auth(['admin']), adminActionWithdrawal);
router.patch('/admin/withdrawals/:id/approve', auth(['admin']), adminActionWithdrawal);
router.patch('/admin/withdrawals/:id/reject', auth(['admin']), adminActionWithdrawal);

// ==================== 3. Instructor Mobile App Endpoints ====================
// Earnings Overview Screen (Figma Node 40012419:6929)
router.get('/', auth(['instructor', 'admin']), getInstructorEarningsOverview);
router.get('/overview', auth(['instructor', 'admin']), getInstructorEarningsOverview);

// Transactions History Screen (Figma Node 40012438:8506)
router.get('/transactions', auth(['instructor', 'admin']), getInstructorTransactionsHistory);
router.get('/history', auth(['instructor', 'admin']), getInstructorTransactionsHistory);
router.get('/transactions/history', auth(['instructor', 'admin']), getInstructorTransactionsHistory);

// Instructor Withdrawal Request
router.post('/withdraw', auth(['instructor', 'admin']), requestWithdrawal);
router.post('/withdrawal', auth(['instructor', 'admin']), requestWithdrawal);

// ==================== 4. Instructor Bank Account (Figma Node 40012508:6741) ====================
router.get('/bank-account', auth(['instructor', 'user', 'admin']), getBankAccount);
router.post('/bank-account', auth(['instructor', 'user', 'admin']), saveBankAccount);
router.put('/bank-account', auth(['instructor', 'user', 'admin']), saveBankAccount);
router.patch('/bank-account', auth(['instructor', 'user', 'admin']), saveBankAccount);
router.delete('/bank-account', auth(['instructor', 'user', 'admin']), deleteBankAccount);

module.exports = router;

