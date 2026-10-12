const express = require('express');
const router = express.Router();
const { auth, authOrOnboarding, tokenCheck } = require('../../middlewares/auth');
const userFileUploadMiddleware = require('../../middlewares/fileUpload');
const convertHeicToPng = require('../../middlewares/converter');
const ensureUploadFolderExists = require('../../helpers/fileExists');
const parseData = require('../../middlewares/parseData');

const UPLOADS_FOLDER_SERVICES = './public/uploads/services';
ensureUploadFolderExists(UPLOADS_FOLDER_SERVICES);
const uploadServices = userFileUploadMiddleware(UPLOADS_FOLDER_SERVICES);

const {
  saveServiceAndPricing,
  getMyService,
  getInstructorService,
  addPublicPool,
  deletePublicPool,
  updatePublicPool
} = require('./serviceAndPricing.controller');

// Public Pool routes (Figma: Add pool modal 40012599:4787 & delete pool)
router.post(
  ['/pool', '/add-pool'],
  authOrOnboarding(['instructor', 'admin']),
  uploadServices.any(),
  parseData(),
  addPublicPool
);

router.delete(
  ['/pool/:poolId', '/remove-pool/:poolId', '/pool'],
  authOrOnboarding(['instructor', 'admin']),
  deletePublicPool
);

router.put(
  ['/pool/:poolId', '/pool'],
  authOrOnboarding(['instructor', 'admin']),
  uploadServices.any(),
  parseData(),
  updatePublicPool
);

router.patch(
  ['/pool/:poolId', '/pool'],
  authOrOnboarding(['instructor', 'admin']),
  uploadServices.any(),
  parseData(),
  updatePublicPool
);

// Instructor routes (Supports multipart upload with file image and data JSON, exactly like update-profile)
router.post(
  ['/', '/create', '/save'],
  authOrOnboarding(['instructor', 'admin']),
  uploadServices.any(),
  convertHeicToPng(UPLOADS_FOLDER_SERVICES),
  parseData(),
  saveServiceAndPricing
);

router.put(
  ['/', '/update'],
  authOrOnboarding(['instructor', 'admin']),
  uploadServices.any(),
  convertHeicToPng(UPLOADS_FOLDER_SERVICES),
  parseData(),
  saveServiceAndPricing
);

router.patch(
  ['/', '/update'],
  authOrOnboarding(['instructor', 'admin']),
  uploadServices.any(),
  convertHeicToPng(UPLOADS_FOLDER_SERVICES),
  parseData(),
  saveServiceAndPricing
);

router.get('/my-service', authOrOnboarding(['instructor', 'admin']), getMyService);

// Public / Client routes
router.get('/details/:instructorId', tokenCheck, getInstructorService);
router.get('/:instructorId', tokenCheck, getInstructorService);

module.exports = router;
