const express = require('express');
const router = express.Router();
const { auth } = require('../../middlewares/auth');
const {
  getAdminRefundsLedger,
  getAdminRefundDetails,
  issueAdminManualRefund
} = require('./refund.controller');

// ==================== Admin Refund Endpoints (Figma Node 40012554:21158) ====================

// 1. Get Refunds Ledger (Tabs: All, Dispute, Cancellation, Manual with counts)
router.get('/admin', auth(['admin']), getAdminRefundsLedger);
router.get('/admin/refunds', auth(['admin']), getAdminRefundsLedger);
router.get('/', auth(['admin']), getAdminRefundsLedger);

// 2. Issue Manual Refund
router.post('/admin/issue', auth(['admin']), issueAdminManualRefund);
router.post('/admin/issue-refund', auth(['admin']), issueAdminManualRefund);
router.post('/issue', auth(['admin']), issueAdminManualRefund);

// 3. Get Single Refund by ID
router.get('/admin/:id', auth(['admin']), getAdminRefundDetails);
router.get('/:id', auth(['admin']), getAdminRefundDetails);

module.exports = router;
