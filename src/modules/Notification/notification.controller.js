const mongoose = require('mongoose');
const catchAsync = require('../../helpers/catchAsync');
const response = require('../../helpers/response');
const { status } = require('http-status');
const userModel = require('../User/user.model');
const {
  createNotificationService,
  getMyNotificationsService,
  getUnreadNotificationCountService,
  markNotificationAsReadService,
  markAllNotificationsAsReadService,
  deleteNotificationService,
  clearAllNotificationsService,
  seedSampleNotificationsForUser
} = require('./notification.service');

/**
 * Helper to resolve active User ID (from JWT token, query param, or demo fallback)
 */
async function resolveUserId(req) {
  if (req.User?._id && mongoose.Types.ObjectId.isValid(req.User._id)) {
    return req.User._id;
  }
  if (req.query?.userId && mongoose.Types.ObjectId.isValid(req.query.userId)) {
    return req.query.userId;
  }
  if (req.headers?.['x-user-id'] && mongoose.Types.ObjectId.isValid(req.headers['x-user-id'])) {
    return req.headers['x-user-id'];
  }

  // Fallback to existing client or instructor in DB for dev presentation
  const userDoc = (await userModel.findOne({ role: 'user' })) || (await userModel.findOne());
  return userDoc ? userDoc._id : null;
}

/**
 * 1. Get My Notifications (Figma Node 40012289:5166)
 * Supports pagination and groups into Today, Yesterday, and Earlier
 */
const getMyNotificationsController = catchAsync(async (req, res) => {
  const userId = await resolveUserId(req);
  if (!userId) {
    return res.status(status.UNAUTHORIZED).json(
      response({
        status: 'FAIL',
        statusCode: status.UNAUTHORIZED,
        type: 'Notification',
        message: 'Unauthorized: User ID not found',
        data: null
      })
    );
  }

  const result = await getMyNotificationsService(userId, req.query);

  return res.status(status.OK).json(
    response({
      status: 'OK',
      statusCode: status.OK,
      type: 'Notification',
      message: 'Notifications fetched successfully',
      data: result
    })
  );
});

/**
 * 2. Get Unread Notification Count
 */
const getUnreadNotificationCountController = catchAsync(async (req, res) => {
  const userId = await resolveUserId(req);
  if (!userId) {
    return res.status(status.UNAUTHORIZED).json(
      response({
        status: 'FAIL',
        statusCode: status.UNAUTHORIZED,
        type: 'Notification',
        message: 'Unauthorized: User ID not found',
        data: { unreadCount: 0 }
      })
    );
  }

  const result = await getUnreadNotificationCountService(userId);

  return res.status(status.OK).json(
    response({
      status: 'OK',
      statusCode: status.OK,
      type: 'Notification',
      message: 'Unread notification count fetched',
      data: result
    })
  );
});

/**
 * 3. Mark Single Notification as Read
 */
const markNotificationAsReadController = catchAsync(async (req, res) => {
  const userId = await resolveUserId(req);
  const notificationId = req.params.id;
  const result = await markNotificationAsReadService(userId, notificationId);

  return res.status(status.OK).json(
    response({
      status: 'OK',
      statusCode: status.OK,
      type: 'Notification',
      message: result.message,
      data: result
    })
  );
});

/**
 * 4. Mark All Notifications as Read (Figma "Mark as all read" button)
 */
const markAllNotificationsAsReadController = catchAsync(async (req, res) => {
  const userId = await resolveUserId(req);
  const result = await markAllNotificationsAsReadService(userId);

  return res.status(status.OK).json(
    response({
      status: 'OK',
      statusCode: status.OK,
      type: 'Notification',
      message: result.message,
      data: result
    })
  );
});

/**
 * 5. Delete a Notification
 */
const deleteNotificationController = catchAsync(async (req, res) => {
  const userId = await resolveUserId(req);
  const notificationId = req.params.id;
  const result = await deleteNotificationService(userId, notificationId);

  return res.status(status.OK).json(
    response({
      status: 'OK',
      statusCode: status.OK,
      type: 'Notification',
      message: result.message,
      data: result
    })
  );
});

/**
 * 6. Clear All Notifications
 */
const clearAllNotificationsController = catchAsync(async (req, res) => {
  const userId = await resolveUserId(req);
  const result = await clearAllNotificationsService(userId);

  return res.status(status.OK).json(
    response({
      status: 'OK',
      statusCode: status.OK,
      type: 'Notification',
      message: result.message,
      data: result
    })
  );
});

/**
 * 7. Send/Create Notification (Admin / System / User trigger)
 */
const createNotificationController = catchAsync(async (req, res) => {
  const senderId = await resolveUserId(req);
  const payload = {
    ...req.body,
    sender: req.body.sender || senderId
  };
  const result = await createNotificationService(payload);

  return res.status(status.CREATED).json(
    response({
      status: 'OK',
      statusCode: status.CREATED,
      type: 'Notification',
      message: 'Notification sent successfully',
      data: result
    })
  );
});

/**
 * 8. Seed Demo Notifications (Matches Figma Node 40012289:5166)
 */
const seedDemoNotificationsController = catchAsync(async (req, res) => {
  const userId = await resolveUserId(req);
  await seedSampleNotificationsForUser(userId);
  const result = await getMyNotificationsService(userId, req.query);

  return res.status(status.OK).json(
    response({
      status: 'OK',
      statusCode: status.OK,
      type: 'Notification',
      message: 'Sample demo notifications seeded successfully',
      data: result
    })
  );
});

module.exports = {
  getMyNotificationsController,
  getUnreadNotificationCountController,
  markNotificationAsReadController,
  markAllNotificationsAsReadController,
  deleteNotificationController,
  clearAllNotificationsController,
  createNotificationController,
  seedDemoNotificationsController
};
