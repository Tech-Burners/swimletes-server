const express = require('express');
const router = express.Router();
const { auth } = require('../../middlewares/auth');
const {
  getMyAvailability,
  getInstructorAvailability,
  updateAvailability,
  addTimeSlot,
  removeTimeSlot,
  toggleDayAvailability,
  getInstructorSlots
} = require('./availability.controller');

// Instructor routes (Protected)
router.get('/my-availability', auth(['instructor']), getMyAvailability);
router.put('/update', auth(['instructor']), updateAvailability);
router.post('/add-slot', auth(['instructor']), addTimeSlot);
router.delete('/slot/:day/:slotId', auth(['instructor']), removeTimeSlot);
router.patch('/toggle-day', auth(['instructor']), toggleDayAvailability);

// Public / Client routes
router.get('/:instructorId/slots', getInstructorSlots);
router.get('/:instructorId', getInstructorAvailability);

module.exports = router;
