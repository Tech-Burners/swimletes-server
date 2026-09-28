const express = require('express');
const router = express.Router();
const { auth, tokenCheck } = require('../../middlewares/auth');
const {
  saveServiceAndPricing,
  getMyService,
  getInstructorService
} = require('./serviceAndPricing.controller');

// Instructor routes
router.post('/', auth(['instructor']), saveServiceAndPricing);
router.put('/', auth(['instructor']), saveServiceAndPricing);
router.get('/my-service', auth(['instructor']), getMyService);

// Public / Client routes
router.get('/details/:instructorId', tokenCheck, getInstructorService);
router.get('/:instructorId', tokenCheck, getInstructorService);

module.exports = router;
