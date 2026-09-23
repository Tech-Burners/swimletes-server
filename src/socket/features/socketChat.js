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
  socket.on('sendMessage', async (data, callback) => {
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
      if (typeof callback === 'function') {
        callback({
          status: 500,
          message: err.message || 'Failed to send message',
          data: null,
          result: null
        });
      }
    }
  });

  // 4. Real-Time Typing Indicator (Figma Screen 2)
  socket.on('typing', (data) => {
    try {
      const { chatId, isTyping = true } = typeof data === 'string' ? JSON.parse(data) : data;
      if (chatId) {
        socket.to(`chat::${chatId}`).emit('userTyping', {
          chatId,
          userId,
          fullName: userFullName,
          isTyping
        });
      }
    } catch (err) {
      console.error('Error in typing socket handler:', err);
    }
  });

  // 5. Real-Time Mark As Read (Read Receipts)
  socket.on('markAsRead', async (data, callback) => {
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
  });

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
