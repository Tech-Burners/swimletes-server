const mongoose = require('mongoose');
const Notification = require('./notification.model');
const userModel = require('../User/user.model');
const ApiError = require('../../helpers/ApiError');
const httpStatus = require('http-status');

/**
 * Format relative timestamp matching Figma (e.g., "2 mins ago", "5h ago", "Yesterday, 2:40 PM", "Aug 3")
 */
function formatNotificationTime(date) {
  if (!date) return '';
  const d = new Date(date);
  const now = new Date();

  // Reset clock for day comparisons
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const startOfItemDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  const diffMs = now.getTime() - d.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

  const formatClockTime = (dt) => {
    let hours = dt.getHours();
    const minutes = String(dt.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${hours}:${minutes} ${ampm}`;
  };

  const monthNamesShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  if (startOfItemDay.getTime() === startOfToday.getTime()) {
    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes === 1) return '1 min ago';
    if (diffMinutes < 60) return `${diffMinutes} mins ago`;
    if (diffHours === 1) return '1h ago';
    return `${diffHours}h ago`;
  }

  if (startOfItemDay.getTime() === startOfYesterday.getTime()) {
    return `Yesterday, ${formatClockTime(d)}`;
  }

  // Older date (e.g. "Aug 3")
  const month = monthNamesShort[d.getMonth()];
  const day = d.getDate();
  if (d.getFullYear() === now.getFullYear()) {
    return `${month} ${day}`;
  }
  return `${month} ${day}, ${d.getFullYear()}`;
}

/**
 * Categorize notification date group: 'Today' | 'Yesterday' | 'Earlier'
 */
function getNotificationDateGroup(date) {
  if (!date) return 'Earlier';
  const d = new Date(date);
  const now = new Date();

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const startOfItemDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  if (startOfItemDay.getTime() === startOfToday.getTime()) {
    return 'Today';
  }
  if (startOfItemDay.getTime() === startOfYesterday.getTime()) {
    return 'Yesterday';
  }
  return 'Earlier';
}

/**
 * Default icon & styling config per notification type
 */
function getTypeIconConfig(type) {
  switch (type) {
    case 'lesson_review':
      return { icon: 'star', iconBg: 'rgba(232, 148, 63, 0.2)' };
    case 'lesson_reminder':
      return { icon: 'clock', iconBg: 'rgba(51, 180, 253, 0.15)' };
    case 'booking_confirmed':
      return { icon: 'calendar-check', iconBg: 'rgba(16, 185, 129, 0.15)' };
    case 'booking_cancelled':
      return { icon: 'calendar-x', iconBg: 'rgba(239, 68, 68, 0.15)' };
    case 'refund_processed':
      return { icon: 'dollar', iconBg: 'rgba(99, 102, 241, 0.15)' };
    case 'booking_declined':
      return { icon: 'x-circle', iconBg: 'rgba(244, 63, 94, 0.15)' };
    case 'chat_message':
      return { icon: 'message', iconBg: 'rgba(51, 180, 253, 0.15)' };
    case 'booking_created':
      return { icon: 'bell', iconBg: 'rgba(232, 148, 63, 0.2)' };
    default:
      return { icon: 'star', iconBg: 'rgba(232, 148, 63, 0.2)' };
  }
}

/**
 * Format notification document into clean frontend payload
 */
function formatNotificationItem(doc) {
  const plain = doc.toObject ? doc.toObject() : doc;
  const timeFormatted = formatNotificationTime(plain.createdAt);
  const dateGroup = getNotificationDateGroup(plain.createdAt);

  return {
    _id: plain._id,
    id: plain._id,
    recipient: plain.recipient?._id || plain.recipient,
    sender: plain.sender
      ? {
          _id: plain.sender._id || plain.sender,
          fullName: plain.sender.fullName || '',
          image: plain.sender.image || '',
          email: plain.sender.email || ''
        }
      : null,
    title: plain.title,
    message: plain.message,
    type: plain.type,
    icon: plain.icon,
    iconBg: plain.iconBg,
    isRead: Boolean(plain.isRead),
    readAt: plain.readAt,
    data: plain.data || {},
    time: timeFormatted,
    relativeTime: timeFormatted,
    dateGroup,
    createdAt: plain.createdAt,
    updatedAt: plain.updatedAt
  };
}

/**
 * 1. Create a Notification & Emit Socket Events
 */
const createNotificationService = async (payload) => {
  const {
    recipient,
    sender = null,
    title,
    message,
    type = 'general',
    data = {},
    icon,
    iconBg
  } = payload;

  if (!recipient || !mongoose.Types.ObjectId.isValid(recipient)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Valid recipient ID is required');
  }

  if (!title || !message) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Notification title and message are required');
  }

  const defaultStyles = getTypeIconConfig(type);

  const notification = await Notification.create({
    recipient,
    sender: sender && mongoose.Types.ObjectId.isValid(sender) ? sender : null,
    title: String(title).trim(),
    message: String(message).trim(),
    type,
    icon: icon || defaultStyles.icon,
    iconBg: iconBg || defaultStyles.iconBg,
    data,
    isRead: false
  });

  const populated = await Notification.findById(notification._id)
    .populate('sender', 'fullName image email')
    .populate('recipient', 'fullName email enabledPushNotification');

  const formatted = formatNotificationItem(populated);

  // Real-time socket delivery
  try {
    if (global.io) {
      const recipientStr = recipient.toString();

      // Emit targeted user notification
      global.io.emit(`get notification::${recipientStr}`, {
        status: 200,
        message: formatted.title,
        data: formatted
      });

      // Emit to private room if user joined
      global.io.to(`user::${recipientStr}`).emit('newNotification', {
        status: 200,
        data: formatted
      });

      // Calculate fresh unread count and emit badge update
      const unreadCount = await Notification.countDocuments({
        recipient,
        isRead: false
      });

      global.io.emit(`notificationCount::${recipientStr}`, {
        unreadCount
      });
      global.io.to(`user::${recipientStr}`).emit('notificationCount', {
        unreadCount
      });
    }
  } catch (socketErr) {
    console.error('Socket notification emit error:', socketErr.message);
  }

  return formatted;
};

/**
 * 2. Get Notifications for the Authenticated User (with Figma Date Grouping & Pagination)
 */
const getMyNotificationsService = async (userId, query = {}) => {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid User ID');
  }

  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.max(1, Math.min(100, parseInt(query.limit, 10) || 20));
  const skip = (page - 1) * limit;

  const filter = { recipient: userId };
  if (query.status === 'unread') {
    filter.isRead = false;
  } else if (query.status === 'read') {
    filter.isRead = true;
  }

  // If user has zero notifications and autoSeed is requested (or query.seedDemo === 'true'),
  // seed the 7 exact notifications from Figma Node 40012289:5166 for demo preview!
  const totalCount = await Notification.countDocuments(filter);
  if (totalCount === 0 && (query.seedDemo === 'true' || query.seedDemo === true)) {
    await seedSampleNotificationsForUser(userId);
  }

  const finalTotalCount = await Notification.countDocuments(filter);
  const unreadCount = await Notification.countDocuments({ recipient: userId, isRead: false });

  const docs = await Notification.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('sender', 'fullName image email');

  const formattedItems = docs.map(formatNotificationItem);

  // Group by 'Today', 'Yesterday', 'Earlier' matching Figma Node 40012289:5166
  const grouped = {
    today: [],
    yesterday: [],
    earlier: []
  };

  formattedItems.forEach((item) => {
    if (item.dateGroup === 'Today') {
      grouped.today.push(item);
    } else if (item.dateGroup === 'Yesterday') {
      grouped.yesterday.push(item);
    } else {
      grouped.earlier.push(item);
    }
  });

  return {
    unreadCount,
    total: finalTotalCount,
    page,
    limit,
    totalPages: Math.ceil(finalTotalCount / limit) || 1,
    grouped,
    notifications: formattedItems
  };
};

/**
 * 3. Get Fast Unread Notification Count
 */
const getUnreadNotificationCountService = async (userId) => {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid User ID');
  }

  const unreadCount = await Notification.countDocuments({
    recipient: userId,
    isRead: false
  });

  return { unreadCount };
};

/**
 * 4. Mark a Single Notification as Read
 */
const markNotificationAsReadService = async (userId, notificationId) => {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid User ID');
  }
  if (!mongoose.Types.ObjectId.isValid(notificationId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid Notification ID');
  }

  const notification = await Notification.findOne({
    _id: notificationId,
    recipient: userId
  });

  if (!notification) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Notification not found');
  }

  if (!notification.isRead) {
    notification.isRead = true;
    notification.readAt = new Date();
    await notification.save();
  }

  const unreadCount = await Notification.countDocuments({
    recipient: userId,
    isRead: false
  });

  // Emit updated count
  try {
    if (global.io) {
      const recipientStr = userId.toString();
      global.io.emit(`notificationCount::${recipientStr}`, { unreadCount });
      global.io.to(`user::${recipientStr}`).emit('notificationCount', { unreadCount });
    }
  } catch (err) {
    console.error('Socket count emit error:', err.message);
  }

  return {
    message: 'Notification marked as read',
    notification: formatNotificationItem(notification),
    unreadCount
  };
};

/**
 * 5. Mark All Notifications as Read ("Mark as all read" button in Figma 40012289:5166)
 */
const markAllNotificationsAsReadService = async (userId) => {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid User ID');
  }

  const updateResult = await Notification.updateMany(
    { recipient: userId, isRead: false },
    { $set: { isRead: true, readAt: new Date() } }
  );

  // Emit 0 unread badge count via socket
  try {
    if (global.io) {
      const recipientStr = userId.toString();
      global.io.emit(`notificationCount::${recipientStr}`, { unreadCount: 0 });
      global.io.to(`user::${recipientStr}`).emit('notificationCount', { unreadCount: 0 });
    }
  } catch (err) {
    console.error('Socket count emit error:', err.message);
  }

  return {
    message: 'All notifications marked as read',
    modifiedCount: updateResult.modifiedCount,
    unreadCount: 0
  };
};

/**
 * 6. Delete a Single Notification
 */
const deleteNotificationService = async (userId, notificationId) => {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid User ID');
  }
  if (!mongoose.Types.ObjectId.isValid(notificationId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid Notification ID');
  }

  const deleted = await Notification.findOneAndDelete({
    _id: notificationId,
    recipient: userId
  });

  if (!deleted) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Notification not found');
  }

  const unreadCount = await Notification.countDocuments({
    recipient: userId,
    isRead: false
  });

  return {
    message: 'Notification deleted successfully',
    unreadCount
  };
};

/**
 * 7. Clear All Notifications for User
 */
const clearAllNotificationsService = async (userId) => {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid User ID');
  }

  const result = await Notification.deleteMany({ recipient: userId });

  return {
    message: 'All notifications cleared successfully',
    deletedCount: result.deletedCount,
    unreadCount: 0
  };
};

/**
 * 8. Seed Exact Figma 40012289:5166 Demo Notifications for a User
 */
const seedSampleNotificationsForUser = async (userId) => {
  if (!mongoose.Types.ObjectId.isValid(userId)) return;

  const now = new Date();

  // Item 1: 2 mins ago
  const dateItem1 = new Date(now.getTime() - 2 * 60 * 1000);
  // Item 2: 5 hours ago
  const dateItem2 = new Date(now.getTime() - 5 * 60 * 60 * 1000);
  // Item 3: Yesterday at 2:40 PM
  const dateItem3 = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 14, 40, 0);
  // Item 4: Yesterday at 11:15 AM
  const dateItem4 = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 11, 15, 0);
  // Item 5: Yesterday at 9:00 AM
  const dateItem5 = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 9, 0, 0);
  // Item 6: Earlier (Aug 3 or 3 days ago)
  const dateItem6 = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 3, 15, 0, 0);
  // Item 7: Earlier (Aug 3 or 3 days ago)
  const dateItem7 = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 3, 10, 30, 0);

  const samples = [
    {
      recipient: userId,
      title: "How was today's lesson?",
      message: 'Rate your instructor to help other parents choose.',
      type: 'lesson_review',
      icon: 'star',
      iconBg: 'rgba(232, 148, 63, 0.2)',
      isRead: false,
      createdAt: dateItem1,
      updatedAt: dateItem1
    },
    {
      recipient: userId,
      title: 'Lesson starts in 1 hour',
      message: 'Oak Lawn Community Pool · 3:00 PM',
      type: 'lesson_reminder',
      icon: 'clock',
      iconBg: 'rgba(51, 180, 253, 0.15)',
      isRead: false,
      createdAt: dateItem2,
      updatedAt: dateItem2
    },
    {
      recipient: userId,
      title: 'Booking confirmed',
      message: 'Thu, Aug 6 at 9:00 AM · 45-min private lesson',
      type: 'booking_confirmed',
      icon: 'calendar-check',
      iconBg: 'rgba(16, 185, 129, 0.15)',
      isRead: false,
      createdAt: dateItem3,
      updatedAt: dateItem3
    },
    {
      recipient: userId,
      title: 'Your instructor cancelled',
      message: 'Aug 5 lesson cancelled',
      type: 'booking_cancelled',
      icon: 'calendar-x',
      iconBg: 'rgba(239, 68, 68, 0.15)',
      isRead: false,
      createdAt: dateItem4,
      updatedAt: dateItem4
    },
    {
      recipient: userId,
      title: 'Refund processed',
      message: '$63.00 back to Visa ·· 4021 in 5–10 days',
      type: 'refund_processed',
      icon: 'dollar',
      iconBg: 'rgba(99, 102, 241, 0.15)',
      isRead: false,
      createdAt: dateItem5,
      updatedAt: dateItem5
    },
    {
      recipient: userId,
      title: 'Request declined',
      message: "Your instructor isn't available Wed, Aug 5 at 3:00 PM. You haven't been charged.",
      type: 'booking_declined',
      icon: 'x-circle',
      iconBg: 'rgba(244, 63, 94, 0.15)',
      isRead: false,
      createdAt: dateItem6,
      updatedAt: dateItem6
    },
    {
      recipient: userId,
      title: 'You have a new message ',
      message: '"Could we push Thursday to 9:30? I have a swim meet running long."',
      type: 'chat_message',
      icon: 'message',
      iconBg: 'rgba(51, 180, 253, 0.15)',
      isRead: false,
      createdAt: dateItem7,
      updatedAt: dateItem7
    }
  ];

  await Notification.insertMany(samples);
};

module.exports = {
  createNotificationService,
  getMyNotificationsService,
  getUnreadNotificationCountService,
  markNotificationAsReadService,
  markAllNotificationsAsReadService,
  deleteNotificationService,
  clearAllNotificationsService,
  seedSampleNotificationsForUser,
  formatNotificationTime,
  getNotificationDateGroup
};
