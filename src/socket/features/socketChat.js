const Chat = require('../../modules/Chat/chat.model');
const {
  sendMessageService,
  markChatAsReadService,
  isUserOnline
} = require('../../modules/Chat/chat.service');

const chatSocketHandler = (io, socket, connectedUsers) => {
  const userId = socket?.decodedToken?._id;
  const userFullName = socket?.decodedToken?.fullName || 'User';

  if (!userId) return;

  // 1. Join Chat Room
  socket.on('joinChat', (data, callback) => {
    try {
      const { chatId } = typeof data === 'string' ? JSON.parse(data) : (data || {});
      if (chatId) {
        const roomName = `chat::${chatId}`;
        socket.join(roomName);
        // console.log(`User ${userId} joined room ${roomName}`);
        if (typeof callback === 'function') {
          callback({ status: 200, message: `Joined chat ${chatId}` });
        }
      }
    } catch (err) {
      console.error('Error in joinChat socket handler:', err);
      if (typeof callback === 'function') {
        callback({ status: 500, message: err.message });
      }
    }
  });

  // 2. Leave Chat Room
  socket.on('leaveChat', (data) => {
    try {
      const { chatId } = typeof data === 'string' ? JSON.parse(data) : (data || {});
      if (chatId) {
        socket.leave(`chat::${chatId}`);
        // console.log(`User ${userId} left room chat::${chatId}`);
      }
    } catch (err) {
      console.error('Error in leaveChat socket handler:', err);
    }
  });

  
  // 3. Real-Time Send Message
  const handleSendMessage = async (data, callback) => {
    try {
      const {
        chatId,
        receiverId,
        text = '',
        images = [],
        files = [],
        voice = '',
        replyTo = null,
        filesData = {}
      } = typeof data === 'string' ? JSON.parse(data) : data;

      // Handle filesData compatibility if sent from existing frontend
      let finalImages = Array.isArray(images) ? images : [];
      let finalFiles = Array.isArray(files) ? files : [];

      if (filesData.images && Array.isArray(filesData.images)) {
        finalImages = finalImages.concat(filesData.images.map((f) => f.url?.replace('/public/', '/') || f));
      }
      if (filesData.docs && Array.isArray(filesData.docs)) {
        finalFiles = finalFiles.concat(filesData.docs.map((f) => ({ url: f.url?.replace('/public/', '/') || f.url, name: f.name || 'document' })));
      }

      const message = await sendMessageService(userId, {
        chatId,
        receiverId,
        text,
        images: finalImages,
        files: finalFiles,
        voice: voice || filesData.voice?.[0]?.url?.replace('/public/', '/') || '',
        replyTo
      });

      if (typeof callback === 'function') {
        callback({
          status: 200,
          message: 'Message sent successfully',
          data: message,
          result: message
        });
      }
    } catch (err) {
      console.error('Error in sendMessage socket handler:', err);
      const errCode = err.statusCode || err.status || 500;
      const errorPayload = {
        status: errCode,
        statusCode: errCode,
        message: err.message || 'Failed to send message',
        chatId: (typeof data === 'object' && data?.chatId) || null,
        data: null,
        result: null
      };

      // 1. Return via Ack Callback (for Postman Ack or frontend promises)
      if (typeof callback === 'function') {
        callback(errorPayload);
      }

      // 2. Also emit directly to the sender's socket as an event
      socket.emit('messageError', errorPayload);
      socket.emit('chatError', errorPayload);
      socket.emit('error', errorPayload);
    }
  };

  // Real-Time Send Message (only 'message' event)
  socket.on('message', handleSendMessage);

  // 4. Real-Time Typing Indicator (Figma Screen 2)
  const handleTyping = async (data) => {
    try {
      const { chatId, isTyping = true } = typeof data === 'string' ? JSON.parse(data) : data;
      if (chatId) {
        const chat = await Chat.findById(chatId).populate('booking');
        if (chat && chat.booking && !['accepted', 'active'].includes(chat.booking.status)) {
          // If booking is not active or accepted, do not broadcast typing
          return;
        }

        const payload = {
          chatId,
          userId,
          fullName: userFullName,
          isTyping
        };

        // 1. Emit to chat room (for active chat screen)
        socket.to(`chat::${chatId}`).emit('userTyping', payload);

        // 2. Also emit directly to other participant's personal room (for Postman / Inbox / background)
        if (chat && chat.participants) {
          chat.participants.forEach((pId) => {
            if (pId.toString() !== userId.toString()) {
              socket.to(`user::${pId.toString()}`).emit('userTyping', payload);
            }
          });
        }
      }
    } catch (err) {
      console.error('Error in typing socket handler:', err);
    }
  };

  socket.on('typing', handleTyping);
  socket.on('userTyping', handleTyping);

  // 5. Real-Time Mark As Read (Read Receipts)
  const handleMarkAsRead = async (data, callback) => {
    try {
      const { chatId } = typeof data === 'string' ? JSON.parse(data) : data;
      if (chatId) {
        const result = await markChatAsReadService(userId, chatId);
        if (typeof callback === 'function') {
          callback({ status: 200, message: result.message });
        }
      }
    } catch (err) {
      console.error('Error in markAsRead socket handler:', err);
      if (typeof callback === 'function') {
        callback({ status: 500, message: err.message });
      }
    }
  };

  socket.on('markAsRead', handleMarkAsRead);
  socket.on('messagesRead', handleMarkAsRead);
  socket.on('readMessage', handleMarkAsRead);

  // 6. Check Online Status of a specific user
  socket.on('checkUserOnline', (data, callback) => {
    try {
      const { targetUserId, userId: queryId } = typeof data === 'string' ? JSON.parse(data) : data;
      const target = targetUserId || queryId;
      const isOnline = isUserOnline(target);
      if (typeof callback === 'function') {
        callback({ userId: target, isOnline });
      }
    } catch (err) {
      console.error('Error in checkUserOnline socket handler:', err);
      if (typeof callback === 'function') {
        callback({ isOnline: false });
      }
    }
  });
};

module.exports = {
  chatSocketHandler
};
