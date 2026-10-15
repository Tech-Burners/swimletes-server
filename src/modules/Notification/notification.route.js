const express = require('express');
const { auth } = require('../../middlewares/auth');
const {
  getMyNotificationsController,
  getUnreadNotificationCountController,
  markNotificationAsReadController,
  markAllNotificationsAsReadController,
  deleteNotificationController,
  clearAllNotificationsController,
  createNotificationController,
  seedDemoNotificationsController
} = require('./notification.controller');

const router = express.Router();

// Allow optional token so requests with Bearer tokens are properly authenticated,
// while dev browser presentation can fall back to resolved preview user.
const authGuard = auth(['user', 'instructor', 'admin'], { optional: true });

// 1. Get user notifications (Figma Node 40012289:5166)
router.get('/', authGuard, getMyNotificationsController);
router.get('/my', authGuard, getMyNotificationsController);

// 2. Get unread badge count
router.get('/unread-count', authGuard, getUnreadNotificationCountController);

// 3. Mark all as read (Figma "Mark as all read" button)
router.patch('/mark-all-read', authGuard, markAllNotificationsAsReadController);
router.patch('/read-all', authGuard, markAllNotificationsAsReadController);

// 4. Seed demo sample notifications matching Figma 40012289:5166
router.post('/seed-demo', authGuard, seedDemoNotificationsController);

// 5. Create / send notification
router.post('/', authGuard, createNotificationController);

// 6. Mark single notification as read
router.patch('/:id/read', authGuard, markNotificationAsReadController);
router.patch('/:id', authGuard, markNotificationAsReadController);

// 7. Delete single notification
router.delete('/:id', authGuard, deleteNotificationController);

// 8. Clear all notifications
router.delete('/', authGuard, clearAllNotificationsController);

module.exports = router;
