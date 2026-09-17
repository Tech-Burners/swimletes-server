const express = require('express');
const { auth, tokenCheck } = require('../../middlewares/auth');
const fileUploadMiddleware = require('../../middlewares/fileUpload');
const ensureUploadFolderExists = require('../../helpers/fileExists');
const parseData = require('../../middlewares/parseData');

const {
  createReportController,
  getAdminDisputesController,
  getAdminDisputeDetailsController,
  resolveDisputeController,
  getMyReportsController
} = require('./report.controller');

const UPLOADS_FOLDER_REPORTS = './public/uploads/reports';
ensureUploadFolderExists(UPLOADS_FOLDER_REPORTS);
const uploadReports = fileUploadMiddleware(UPLOADS_FOLDER_REPORTS);

const router = express.Router();

// User endpoints (Figma Screen 3 - Report an issue modal: 40012251:1267)
router.post(
  '/',
  auth(['user', 'instructor', 'admin']),
  uploadReports.array('images', 5),
  parseData(),
  createReportController
);
router.post(
  '/create',
  auth(['user', 'instructor', 'admin']),
  uploadReports.array('images', 5),
  parseData(),
  createReportController
);
router.get('/my-reports', auth(['user', 'instructor', 'admin']), getMyReportsController);

// Admin dispute management endpoints (Figma Screen 1: 40012554:20231 & Screen 2: 40012554:20832)
router.get('/admin/disputes', tokenCheck, getAdminDisputesController);
router.get('/admin/disputes/:id', tokenCheck, getAdminDisputeDetailsController);
router.patch('/admin/disputes/:id/resolve', auth(['admin', 'sub_admin']), resolveDisputeController);

// Single report details & resolution
router.get('/:id', tokenCheck, getAdminDisputeDetailsController);
router.patch('/:id/resolve', auth(['admin', 'sub_admin']), resolveDisputeController);

module.exports = router;