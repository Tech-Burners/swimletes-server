const express = require('express');
const router = express.Router();
const { tokenCheck } = require('../../middlewares/auth');
const {
  getFeeSettingsController,
  updatePlatformFeeController,
  updateInstructorCommissionController,
  getFeeHistoryController
} = require('./platformSetting.controller');

// ==================== Admin Fees & Commission (Figma Node 40012563:24404 & 40012563:25010) ====================
// 1. Get current fees and commission percentages
router.get('/', tokenCheck, getFeeSettingsController);
router.get('/fees', tokenCheck, getFeeSettingsController);

// 2. Update Platform Fee (Save fee)
router.patch('/platform-fee', tokenCheck, updatePlatformFeeController);
router.put('/platform-fee', tokenCheck, updatePlatformFeeController);

// 3. Update Instructor Commission (Save commission)
router.patch('/commission', tokenCheck, updateInstructorCommissionController);
router.put('/commission', tokenCheck, updateInstructorCommissionController);

// 4. View Audit History (HistoryModal)
router.get('/history', tokenCheck, getFeeHistoryController);
router.get('/history/:type', tokenCheck, getFeeHistoryController);

module.exports = router;
