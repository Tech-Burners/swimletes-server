const safeSocketHandler = require("../../helpers/safeSocketHandler");

const notificationHandler = (io, socket) => {
  socket.on(
    "push notification",
    safeSocketHandler(async (data, callback, socket, io) => {
      const result = await addNotificationService(data);

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
  // console.log({data})
  io.emit(`get notification::${data.targetUser}`, {
    status: 200,
    message: data.title,
    data: data,
  });
};


const adminNotificationHandler = (data) => {
  io.emit(`admin notification`, {
    status: 200,
    message: data.title,
    data: data,
  });
};


module.exports = { notificationHandler, EmiteNotificationHandler, adminNotificationHandler };
