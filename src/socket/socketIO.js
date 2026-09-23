const socketAuthMiddleware = require("./auth");
const { notificationHandler } = require("./features/socketNotification");
const { chatSocketHandler } = require("./features/socketChat");
const bookingModel = require("../modules/Booking/booking.model");

const { connectedUsers } = require("./connectedUsers");

const socketIO = (io) => {
  try {
    // Apply socket authentication middleware
    io.use(socketAuthMiddleware);

    io.on("connection", (socket) => {
      let userId;

      try {
        userId = socket?.decodedToken?._id;
        const userFullName = socket?.decodedToken?.fullName || "User";

        if (userId) {
          const uKey = userId.toString();
          connectedUsers.set(uKey, socket.id);

          // Join user's personal private room
          socket.join(`user::${uKey}`);

          // Broadcast user online status
          io.emit("userOnline", {
            userId: uKey,
            fullName: userFullName,
            isOnline: true,
            timestamp: new Date()
          });

          // Also emit list of all online user IDs
          io.emit("connectUser", Array.from(connectedUsers.keys()));
        }

        // 1. Mount Chat Socket Features (SendMessage, JoinChat, Typing, MarkAsRead, etc.)
        try {
          chatSocketHandler(io, socket, connectedUsers);
        } catch (err) {
          console.error("Error in chatSocketHandler:", err);
        }

        // 2. Provider Live Location Tracking (for Lesson arrival/status)
        socket.on("providerAddress", async (data, callback) => {
          try {
            const parsedData = typeof data === "string" ? JSON.parse(data) : data;
            const { providerLongitude: long, providerLatitude: lat, bookingId } = parsedData;

            let currentStatus = null;
            if (bookingId) {
              const booking = await bookingModel.findById(bookingId).select('status');
              currentStatus = booking?.status || null;
            }

            const newData = { lat, long, currentStatus, bookingId, timestamp: new Date() };
            io.emit(`providerAddress::${bookingId}`, newData);

            if (typeof callback === "function") {
              callback({
                status: 200,
                message: "Address updated successfully",
                result: newData
              });
            }
          } catch (err) {
            console.error("Error in providerAddress:", err);
            if (typeof callback === "function") {
              callback({
                status: 500,
                message: err.message || "Failed to update address",
                result: null
              });
            }
          }
        });

        // 3. Notification handler
        try {
          notificationHandler(io, socket);
        } catch (err) {
          console.error("Error in notificationHandler:", err);
        }

        // 4. Handle Disconnect
        socket.on("disconnect", () => {
          try {
            if (userId) {
              const uKey = userId.toString();
              connectedUsers.delete(uKey);

              // Broadcast offline event
              io.emit("userOffline", {
                userId: uKey,
                isOnline: false,
                lastSeen: new Date()
              });

              io.emit("connectUser", Array.from(connectedUsers.keys()));
            }
          } catch (err) {
            console.error("Error on disconnect:", err);
          }
        });

      } catch (err) {
        console.error("Error during socket connection:", err);

        socket.on("disconnect", () => {
          try {
            if (userId) {
              connectedUsers.delete(userId.toString());
              io.emit("connectUser", Array.from(connectedUsers.keys()));
            }
          } catch (disconnectErr) {
            console.error("Error on disconnect after connection error:", disconnectErr);
          }
        });
      }
    });

  } catch (err) {
    console.error("Error initializing socketIO:", err);
  }
};

module.exports = {
  socketIO,
  connectedUsers,
};
