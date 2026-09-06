const socketAuthMiddleware = require("./auth");
const { notificationHandler } = require("./features/socketNotification");

const connectedUsers = new Map();

const socketIO = (io) => {
  try {
    // Apply socket authentication middleware
    io.use(socketAuthMiddleware);

    io.on("connection", (socket) => {
      let userId;

      try {
        userId = socket?.decodedToken?._id;
        // console.log(`User ID: ${userId} just connected`);
        // console.log("before connectedUsers map::", connectedUsers);

        if (userId) connectedUsers.set(userId.toString(), socket.id);

        io.emit("connectUser", Array.from(connectedUsers.keys()));
        // console.log("after connectedUsers map::", connectedUsers);

        // Handle sendMessage
        socket.on("sendMessage", async (data, callback) => {
          try {
            const { chatId, text = "", filesData = {} } = data;

            const images = filesData.images?.map(f => f.url.replace('/public/', '/')) || [];
            const docs = filesData.docs?.map(f => ({ url: f.url.replace('/public/', '/'), name: f.name })) || [];
            const voice = filesData.voice?.[0]?.url.replace('/public/', '/') || '';

            // Validate required fields
            if (!chatId || !userId || (!text && images.length === 0 && docs.length === 0 && !voice)) {
              throw new Error("Missing required fields: chatId, sender, or message content");
            }

            // Save message
            const newMessage = await messageModel.create({
              chatId,
              sender: userId,
              text,
              images,
              files: docs,
              voice
            });

            // Update chat's lastMessage
            await chatModel.findByIdAndUpdate(chatId, { lastMessage: newMessage._id });

            // Emit message to all connected clients (or room)
            io.emit(`get message::${chatId}`, newMessage);

            const chatUsers = await getChatUsers(chatId);
            // console.log("chatUsers::", chatUsers);

            // Determine chat list preview
            let lastMessagePreview = "";

            if (newMessage.text) {
              lastMessagePreview = newMessage.text;
            } else if (newMessage.images?.length > 0) {
              lastMessagePreview = "📷 Photo";
            } else if (newMessage.files?.length > 0) {
              lastMessagePreview = "📄 Document";
            } else if (newMessage.voice) {
              lastMessagePreview = "🎤 Voice message";
            }

            // Send update to each user in chat
            for (let uid of chatUsers) {
              const socketId = connectedUsers.get(uid.toString());
              if (socketId) {
                io.to(socketId).emit("chatListUpdate", {
                  chatId,
                  lastMessage: lastMessagePreview,
                  updatedAt: new Date()
                });
              }
            }

            // Success callback
            callback({
              status: 200,
              message: "Message sent successfully",
              result: newMessage
            });

          } catch (err) {
            console.error("Error in sendMessage:", err);
            callback({
              status: 500,
              message: err.message || "Failed to send message",
              result: null
            });
          }
        });


        //map route
        socket.on("providerAddress", async (data, callback) => {
          try {
            const parsedData = typeof data === "string" ? JSON.parse(data) : data;
            const { providerLongitude: long, providerLatitude: lat, bookingId } = parsedData;

            const booking = await bookingById(bookingId);
            const currentStatus = booking?.status;

            const newData = { lat, long, currentStatus };
            io.emit(`providerAddress::${bookingId}`, newData);

            //  Only call callback if it exists
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

        // Notification handler
        try {
          notificationHandler(io, socket);
        } catch (err) {
          console.error("Error in notificationHandler:", err);
        }

        // Handle disconnect
        socket.on("disconnect", () => {
          try {
            console.log(`User ID: ${userId} disconnected`);
            connectedUsers.delete(userId);
            io.emit("connectUser", Array.from(connectedUsers.keys()));
          } catch (err) {
            console.error("Error on disconnect:", err);
          }
        });

      } catch (err) {
        console.error("Error during socket connection:", err);

        // Ensure disconnect handling even on connection error
        socket.on("disconnect", () => {
          try {
            console.log(`User ID: ${userId} disconnected after connection error`);
            if (userId) connectedUsers.delete(userId);
            io.emit("connectUser", Array.from(connectedUsers.keys()));
          } catch (err) {
            console.error("Error on disconnect after connection error:", err);
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

