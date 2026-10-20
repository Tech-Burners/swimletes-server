const safeSocketHandler = require("../../helpers/safeSocketHandler");
const {
  createNotificationService,
  getMyNotificationsService,
  getUnreadNotificationCountService,
  markNotificationAsReadService,
  markAllNotificationsAsReadService
} = require("../../modules/Notification/notification.service");
const { connectedUsers } = require("../connectedUsers");

const notificationHandler = (io, socket) => {
  const currentUserId = socket.userId || socket?.decodedToken?._id;

  // 1. Client pushes a notification
  socket.on(
    "push notification",
    safeSocketHandler(async (data, callback, socket, io) => {
      const payload = typeof data === 'string' ? JSON.parse(data) : data;
      const result = await createNotificationService({
        recipient: payload.recipient || payload.targetUser,
        sender: payload.sender || socket.userId,
        title: payload.title || payload.message,
        message: payload.message || payload.title,
        type: payload.type || 'general',
        data: payload.data || {},
        icon: payload.icon,
        iconBg: payload.iconBg
      });

      callback?.({
        status: 200,
        message: "Notification added successfully",
        data: result,
      });

      io.emit("get notification", {
        status: 200,
        message: "New notification available",
        data: result,
      });
    }, socket, io)
  );

  // 2. Fetch Notifications via Socket
  socket.on(
    "getNotifications",
    safeSocketHandler(async (data, callback, socket, io) => {
      const uId = socket.userId || currentUserId;
      if (!uId) {
        return callback?.({ status: 401, message: "Unauthorized: User ID not found" });
      }
      const query = typeof data === 'object' && data !== null ? data : {};
      const result = await getMyNotificationsService(uId, query);

      callback?.({
        status: 200,
        message: "Notifications fetched successfully",
        data: result
      });

      socket.emit("notificationsList", {
        status: 200,
        data: result
      });
    }, socket, io)
  );

  // 3. Fetch Unread Count via Socket
  socket.on(
    "getUnreadCount",
    safeSocketHandler(async (data, callback, socket, io) => {
      const uId = socket.userId || currentUserId;
      if (!uId) {
        return callback?.({ status: 401, message: "Unauthorized: User ID not found" });
      }
      const result = await getUnreadNotificationCountService(uId);

      callback?.({
        status: 200,
        unreadCount: result.unreadCount,
        data: result
      });

      socket.emit("notificationCount", {
        status: 200,
        unreadCount: result.unreadCount
      });
    }, socket, io)
  );

  // 4. Mark Single Notification as Read
  socket.on(
    "markAsRead",
    safeSocketHandler(async (data, callback, socket, io) => {
      const uId = socket.userId || currentUserId;
      const { notificationId } = typeof data === 'string' ? { notificationId: data } : (data || {});

      if (!uId || !notificationId) {
        return callback?.({ status: 400, message: "Valid notificationId and authenticated user required" });
      }

      const result = await markNotificationAsReadService(uId, notificationId);

      callback?.({
        status: 200,
        message: "Notification marked as read",
        data: result
      });
    }, socket, io)
  );

  // 5. Mark All Notifications as Read
  socket.on(
    "markAllAsRead",
    safeSocketHandler(async (data, callback, socket, io) => {
      const uId = socket.userId || currentUserId;
      if (!uId) {
        return callback?.({ status: 401, message: "Unauthorized: User ID not found" });
      }

      const result = await markAllNotificationsAsReadService(uId);

      callback?.({
        status: 200,
        message: "All notifications marked as read",
        data: result
      });
    }, socket, io)
  );
};

/**
 * Broadcast notification payload to all client channels and rooms
 */
const EmiteNotificationHandler = (data) => {
  const ioInstance = global.io;
  if (!ioInstance) return;

  const targetId = (data.targetUser || data.recipient?._id || data.recipient || '').toString();
  if (!targetId) return;

  const payload = {
    status: 200,
    message: data.title || data.message || 'New notification',
    data: data,
    notification: data
  };

  // 1. Target personal rooms
  [`user::${targetId}`, targetId, `user_${targetId}`].forEach((room) => {
    ioInstance.to(room).emit('newNotification', payload);
    ioInstance.to(room).emit('notification', payload);
    ioInstance.to(room).emit('get notification', payload);
  });

  // 2. Target specific dynamic event names
  ioInstance.emit(`get notification::${targetId}`, payload);
  ioInstance.emit(`notification::${targetId}`, payload);
  ioInstance.emit(`newNotification::${targetId}`, payload);

  // 3. Direct socket delivery if tracked
  if (connectedUsers && connectedUsers.has(targetId)) {
    const socketId = connectedUsers.get(targetId);
    if (socketId) {
      ioInstance.to(socketId).emit('newNotification', payload);
      ioInstance.to(socketId).emit('notification', payload);
    }
  }
};

const adminNotificationHandler = (data) => {
  const ioInstance = global.io;
  if (!ioInstance) return;

  const payload = {
    status: 200,
    message: data.title || data.message || 'New admin notification',
    data: data
  };

  ioInstance.emit(`admin notification`, payload);
  ioInstance.emit(`adminNotification`, payload);
  ioInstance.to('admin').emit('newNotification', payload);
};

module.exports = {
  notificationHandler,
  EmiteNotificationHandler,
  adminNotificationHandler,
  addNotificationService: createNotificationService
};
