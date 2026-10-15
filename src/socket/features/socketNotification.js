const safeSocketHandler = require("../../helpers/safeSocketHandler");
const { createNotificationService } = require("../../modules/Notification/notification.service");

const notificationHandler = (io, socket) => {
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
};

const EmiteNotificationHandler = (data) => {
  const ioInstance = global.io;
  if (!ioInstance) return;
  const targetId = data.targetUser || data.recipient;
  ioInstance.emit(`get notification::${targetId}`, {
    status: 200,
    message: data.title || data.message,
    data: data,
  });
};

const adminNotificationHandler = (data) => {
  const ioInstance = global.io;
  if (!ioInstance) return;
  ioInstance.emit(`admin notification`, {
    status: 200,
    message: data.title || data.message,
    data: data,
  });
};

module.exports = {
  notificationHandler,
  EmiteNotificationHandler,
  adminNotificationHandler,
  addNotificationService: createNotificationService
};
