const express = require('express');
const router = express.Router();
const { auth } = require('../../middlewares/auth');
const fileUpload = require('../../middlewares/fileUpload');
const parseData = require('../../middlewares/parseData');
const convertHeicToPng = require('../../middlewares/converter');
const ensureUploadFolderExists = require('../../helpers/fileExists');

const UPLOADS_FOLDER_REPORTS = './public/uploads/reports';
ensureUploadFolderExists(UPLOADS_FOLDER_REPORTS);
const upload = fileUpload(UPLOADS_FOLDER_REPORTS);

const {
  createReport,
  getAdminDisputesList,
  getAdminDisputeDetails,
  resolveDispute,
  getMyReports
} = require('./report.controller');

// 1. Admin Disputes Endpoints (Figma 40012554:20231 & 40012554:20832)
router.get('/admin/disputes', auth(['admin'], { optional: true }), getAdminDisputesList);
router.get('/admin/disputes/:id', auth(['admin'], { optional: true }), getAdminDisputeDetails);
router.patch('/admin/disputes/:id/resolve', auth(['admin'], { optional: true }), resolveDispute);
router.patch('/admin/disputes/:id/dismiss', auth(['admin'], { optional: true }), resolveDispute);
router.get('/admin/:id', auth(['admin'], { optional: true }), getAdminDisputeDetails);
router.patch('/admin/:id/resolve', auth(['admin'], { optional: true }), resolveDispute);
router.patch('/admin/:id/dismiss', auth(['admin'], { optional: true }), resolveDispute);
router.patch('/admin/:id', auth(['admin'], { optional: true }), resolveDispute);
router.get('/admin', auth(['admin'], { optional: true }), getAdminDisputesList);
 
// 2. Incident / Issue Report Creation (Figma 40012392:3369)
router.post(
  '/create',
  auth(['user', 'instructor', 'admin'], { optional: true }),
  upload.any(),
  convertHeicToPng(UPLOADS_FOLDER_REPORTS),
  parseData(),
  createReport
);
router.post(
  '/',
  auth(['user', 'instructor', 'admin'], { optional: true }),
  upload.any(),
  convertHeicToPng(UPLOADS_FOLDER_REPORTS),
  parseData(),
  createReport
);

// 3. User / Instructor Reports History
router.get('/my-reports', auth(['user', 'instructor', 'admin']), getMyReports);

// 4. Single Dispute by ID
router.get('/:id', auth(['user', 'instructor', 'admin'], { optional: true }), getAdminDisputeDetails);

module.exports = router;
