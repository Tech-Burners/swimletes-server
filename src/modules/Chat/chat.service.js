const mongoose = require('mongoose');
const { status } = require('http-status');
const ApiError = require('../../helpers/ApiError');
const Chat = require('./chat.model');
const Message = require('./message.model');
const userModel = require('../User/user.model');
const Booking = require('../Booking/booking.model');
const { connectedUsers, isUserOnline } = require('../../socket/connectedUsers');

/**
 * Helper to determine if messaging is allowed between two participants based on booking status.
 * Rule: Chatting is allowed ONLY when booking status is 'accepted' or 'active'.
 * In all other states (pending, completed, cancelled, declined, disputed), users can view history but CANNOT send new messages.
 */
const checkChatBookingPermission = async (chat, userId, targetUserId) => {
  let booking = null;

  // 1. If chat already has a linked booking
  if (chat && chat.booking && typeof chat.booking === 'object' && chat.booking.status) {
    booking = chat.booking;
  } else if (chat && chat.booking) {
    booking = await Booking.findById(chat.booking);
  }

  // 2. If no booking linked to chat, search for an accepted or active booking between the two participants
  if (!booking && targetUserId) {
    booking = await Booking.findOne({
      $or: [
        { client: userId, instructor: targetUserId },
        { client: targetUserId, instructor: userId }
      ],
      status: { $in: ['accepted', 'active'] }
    });

    if (booking && chat) {
      chat.booking = booking._id;
      await chat.save();
    }
  }

  // 3. If still no active/accepted booking, find the latest booking between them
  if (!booking && targetUserId) {
    booking = await Booking.findOne({
      $or: [
        { client: userId, instructor: targetUserId },
        { client: targetUserId, instructor: userId }
      ]
    }).sort({ createdAt: -1 });

    if (booking && chat && !chat.booking) {
      chat.booking = booking._id;
      await chat.save();
    }
  }

  const allowedStatuses = ['accepted', 'active'];
  const isAllowed = Boolean(booking && allowedStatuses.includes(booking.status));

  let reason = null;
  if (!booking) {
    reason = 'You are not allowed to send message because there is no active booking.';
  } else if (!isAllowed) {
    reason = `You are not allowed to send message because the booking is not active (current status: '${booking.status}'). Messaging is only allowed when the booking is accepted or active.`;
  }

  return {
    canChat: isAllowed,
    bookingStatus: booking?.status || null,
    bookingId: booking?._id || null,
    reason
  };
};

/**
 * Format timestamp display (e.g., '10:30 AM', 'Yesterday', '19 Aug')
 * @param {Date} date 
 * @returns {string}
 */
const formatMessageTime = (date) => {
  if (!date) return '';
  const d = new Date(date);
  const now = new Date();
  
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();

  if (isToday) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (isYesterday) {
    return 'Yesterday';
  }
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
};

/**
 * Find or Create a 1-on-1 Chat between two users
 */
const createOrGetChatService = async (userId, targetUserId, bookingId = null) => {
  if (!targetUserId) {
    throw new ApiError(status.BAD_REQUEST, 'Target participant ID is required');
  }

  if (userId.toString() === targetUserId.toString()) {
    throw new ApiError(status.BAD_REQUEST, 'Cannot create a chat with yourself');
  }

  const targetUser = await userModel.findById(targetUserId).select(
    '_id fullName email image role isVerified'
  );
  if (!targetUser) {
    throw new ApiError(status.NOT_FOUND, 'Target user not found');
  }

  // Look for existing chat between these two users
  let chat = await Chat.findOne({
    participants: { $all: [userId, targetUserId] }
  })
    .populate('participants', '_id fullName image')
    .populate('booking', 'status');

  if (!chat) {
    chat = await Chat.create({
      participants: [userId, targetUserId],
      booking: bookingId || null,
      unreadCounts: {
        [userId.toString()]: 0,
        [targetUserId.toString()]: 0
      }
    });

    chat = await Chat.findById(chat._id)
      .populate('participants', '_id fullName image')
      .populate('booking', 'status');
  }

  // Format participant for UI
  const otherParticipant = chat.participants.find(
    (p) => p._id.toString() !== userId.toString()
  );

  const permission = await checkChatBookingPermission(chat, userId, otherParticipant?._id);

  const partner = otherParticipant
    ? {
        _id: otherParticipant._id,
        fullName: otherParticipant.fullName,
        image: otherParticipant.image || '',
        isOnline: isUserOnline(otherParticipant._id)
      }
    : null;

  return {
    _id: chat._id,
    chatId: chat._id,
    user: partner
  };
};

/**
 * Get My Conversations (Inbox List) - Figma Screen 1 (40012257:2626)
 */
const getMyConversationsService = async (userId, { search = '', page = 1, limit = 20 }) => {
  const pageNum = Number(page) || 1;
  const limitNum = Number(limit) || 20;
  const skip = (pageNum - 1) * limitNum;
  const userObjId = new mongoose.Types.ObjectId(userId);

  // Find all chats user is participant of
  let chats = await Chat.find({ participants: userObjId })
    .populate('participants', '_id fullName image')
    .populate('lastMessage', 'text')
    .sort({ lastMessageAt: -1, updatedAt: -1 });

  // Map conversations with clean UI structure
  let formattedConversations = chats.map((chat) => {
    const otherUser = chat.participants.find(
      (p) => p._id.toString() !== userId.toString()
    );

    const unreadCount = (chat.unreadCounts && chat.unreadCounts.get(userId.toString())) || 0;

    const partner = otherUser
      ? {
          _id: otherUser._id,
          fullName: otherUser.fullName,
          image: otherUser.image || '',
          isOnline: isUserOnline(otherUser._id)
        }
      : null;

    const lastMessageText = chat.lastMessageText || chat.lastMessage?.text || '';
    const lastTime = chat.lastMessageAt || chat.updatedAt;

    return {
      _id: chat._id,
      chatId: chat._id,
      user: partner,
      lastMessage: lastMessageText,
      time: formatMessageTime(lastTime),
      unreadCount
    };
  });

  // If search provided, filter by otherUser's name or lastMessage
  if (search && search.trim()) {
    const q = search.trim().toLowerCase();
    formattedConversations = formattedConversations.filter(
      (c) =>
        (c.user?.fullName && c.user.fullName.toLowerCase().includes(q)) ||
        (c.lastMessage && c.lastMessage.toLowerCase().includes(q))
    );
  }

  const total = formattedConversations.length;
  const paginatedConversations = formattedConversations.slice(skip, skip + limitNum);

  return {
    conversations: paginatedConversations,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1
    }
  };
};

/**
 * Get Message History for a Chat - Figma Screen 2 (40012262:7458)
 */
const getChatMessagesService = async (userId, chatId, { page = 1, limit = 30 }) => {
  if (!mongoose.Types.ObjectId.isValid(chatId)) {
    throw new ApiError(status.BAD_REQUEST, 'Invalid Chat ID');
  }

  const chat = await Chat.findById(chatId)
    .populate('participants', '_id fullName image')
    .populate('booking', 'status');

  if (!chat) {
    throw new ApiError(status.NOT_FOUND, 'Chat conversation not found');
  }

  const isParticipant = chat.participants.some(
    (p) => p._id.toString() === userId.toString()
  );
  if (!isParticipant) {
    throw new ApiError(status.FORBIDDEN, 'You are not a participant in this chat');
  }

  const pageNum = Number(page) || 1;
  const limitNum = Number(limit) || 30;
  const skip = (pageNum - 1) * limitNum;

  // Fetch messages sorted ascending by date
  const messages = await Message.find({ chatId })
    .populate('sender', '_id fullName image')
    .populate('replyTo', '_id text')
    .sort({ createdAt: 1 })
    .skip(skip)
    .limit(limitNum);

  const total = await Message.countDocuments({ chatId });

  // Mark all unread messages received by this user as read
  const unreadCount = await Message.countDocuments({
    chatId,
    receiver: userId,
    isRead: false
  });

  if (unreadCount > 0) {
    await Message.updateMany(
      { chatId, receiver: userId, isRead: false },
      { $set: { isRead: true, readAt: new Date() } }
    );

    // Reset unread count in Chat document
    if (chat.unreadCounts) {
      chat.unreadCounts.set(userId.toString(), 0);
      await chat.save();
    }

    // Emit realtime read receipt via socket if global.io exists
    if (global.io) {
      global.io.to(`chat::${chatId}`).emit('messagesRead', {
        chatId,
        readBy: userId,
        readAt: new Date()
      });
    }
  }

  // Group messages by Date header for UI rendering (e.g., '19 August', 'Today')
  const groupedMessages = [];
  let currentDate = '';

  messages.forEach((msg) => {
    const msgDate = new Date(msg.createdAt);
    const now = new Date();
    let dateLabel = msgDate.toLocaleDateString('en-US', { day: 'numeric', month: 'long' });
    
    if (msgDate.toDateString() === now.toDateString()) {
      dateLabel = 'Today';
    } else {
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      if (msgDate.toDateString() === yesterday.toDateString()) {
        dateLabel = 'Yesterday';
      }
    }

    if (dateLabel !== currentDate) {
      currentDate = dateLabel;
      groupedMessages.push({
        type: 'date_separator',
        date: dateLabel
      });
    }

    const senderId = msg.sender?._id ? msg.sender._id.toString() : (msg.sender?.toString() || '');
    const isMe = senderId === userId.toString();

    const senderObj = msg.sender && typeof msg.sender === 'object'
      ? {
          _id: msg.sender._id,
          id: msg.sender._id,
          fullName: msg.sender.fullName || '',
          image: msg.sender.image || ''
        }
      : {
          _id: msg.sender,
          id: msg.sender,
          fullName: '',
          image: ''
        };

    groupedMessages.push({
      _id: msg._id,
      sender: senderObj,
      text: msg.text || '',
      images: msg.images || [],
      files: msg.files || [],
      voice: msg.voice || '',
      messageType: msg.messageType || 'text',
      time: msgDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isMe,
      isRead: msg.isRead || false,
      replyTo: msg.replyTo
        ? {
            _id: msg.replyTo._id,
            text: msg.replyTo.text || ''
          }
        : null,
      createdAt: msg.createdAt
    });
  });

  const otherParticipant = chat.participants.find(
    (p) => p._id.toString() !== userId.toString()
  );

  const partner = otherParticipant
    ? {
        _id: otherParticipant._id,
        fullName: otherParticipant.fullName,
        image: otherParticipant.image || '',
        isOnline: isUserOnline(otherParticipant._id)
      }
    : null;

  return {
    chat: {
      _id: chat._id,
      chatId: chat._id,
      user: partner
    },
    messages: groupedMessages,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1
    }
  };
};

/**
 * Send Message (via REST API fallback or Socket Handler)
 */
const sendMessageService = async (userId, { chatId, receiverId, text = '', images = [], files = [], voice = '', replyTo = null }) => {
  let targetChat;

  if (chatId) {
    targetChat = await Chat.findById(chatId);
    if (!targetChat) {
      throw new ApiError(status.NOT_FOUND, 'Chat not found');
    }
  } else if (receiverId) {
    targetChat = await Chat.findOne({
      participants: { $all: [userId, receiverId] }
    });
    if (!targetChat) {
      targetChat = await Chat.create({
        participants: [userId, receiverId],
        unreadCounts: {
          [userId.toString()]: 0,
          [receiverId.toString()]: 0
        }
      });
    }
  } else {
    throw new ApiError(status.BAD_REQUEST, 'Either chatId or receiverId must be provided');
  }

  // Derive recipient ID
  const actualReceiverId = receiverId || targetChat.participants.find(
    (p) => p.toString() !== userId.toString()
  );

  if (!actualReceiverId) {
    throw new ApiError(status.BAD_REQUEST, 'Unable to identify message recipient');
  }

  // Check booking permission: Chatting is allowed ONLY when booking status is 'accepted' or 'active'
  const permission = await checkChatBookingPermission(targetChat, userId, actualReceiverId);
  if (!permission.canChat) {
    throw new ApiError(status.FORBIDDEN, permission.reason);
  }

  // Normalize both images and files input (unified handling for both)
  const isImageFile = (urlOrName = '') => {
    return /\.(jpg|jpeg|png|webp|gif|heic|bmp|svg)(\?.*)?$/i.test(String(urlOrName));
  };

  let normalizedImages = Array.isArray(images) ? [...images] : (images ? [images] : []);
  let normalizedFiles = [];

  const rawFiles = Array.isArray(files) ? files : (files ? [files] : []);
  rawFiles.forEach((f) => {
    if (!f) return;
    if (typeof f === 'string') {
      const cleanUrl = f.replace('/public/', '/');
      if (isImageFile(cleanUrl)) {
        normalizedImages.push(cleanUrl);
      } else {
        normalizedFiles.push({
          url: cleanUrl,
          name: cleanUrl.split('/').pop() || 'document'
        });
      }
    } else if (typeof f === 'object') {
      const url = (f.url || f.path || '').replace('/public/', '/');
      const isImg = isImageFile(url) || isImageFile(f.name) || (f.mimeType && f.mimeType.startsWith('image/'));
      if (isImg && url) {
        normalizedImages.push(url);
      } else if (url) {
        normalizedFiles.push({
          url,
          name: f.name || url.split('/').pop() || 'document',
          size: f.size || 0,
          mimeType: f.mimeType || ''
        });
      }
    }
  });

  normalizedImages = [...new Set(normalizedImages)];

  // Validate message has content
  const hasText = text && text.trim().length > 0;
  const hasImages = normalizedImages.length > 0;
  const hasFiles = normalizedFiles.length > 0;
  const hasVoice = Boolean(voice);

  if (!hasText && !hasImages && !hasFiles && !hasVoice) {
    throw new ApiError(status.BAD_REQUEST, 'Message content cannot be empty');
  }

  // Determine message type
  let messageType = 'text';
  let previewText = text;
  if (hasImages) {
    messageType = 'image';
    previewText = previewText || '📷 Photo';
  } else if (hasFiles) {
    messageType = 'file';
    previewText = previewText || '📄 Document';
  } else if (hasVoice) {
    messageType = 'voice';
    previewText = '🎤 Voice message';
  }

  // Create message in DB
  const newMessage = await Message.create({
    chatId: targetChat._id,
    sender: userId,
    receiver: actualReceiverId,
    text: text ? text.trim() : '',
    images: normalizedImages,
    files: normalizedFiles,
    voice: voice || '',
    messageType,
    replyTo: replyTo || null,
    isDelivered: true,
    deliveredAt: new Date()
  });

  const populatedMessage = await Message.findById(newMessage._id)
    .populate('sender', '_id fullName image role')
    .populate('replyTo');

  // Update Chat document
  const currentReceiverUnread = (targetChat.unreadCounts && targetChat.unreadCounts.get(actualReceiverId.toString())) || 0;
  if (!targetChat.unreadCounts) targetChat.unreadCounts = new Map();
  targetChat.unreadCounts.set(actualReceiverId.toString(), currentReceiverUnread + 1);
  targetChat.lastMessage = newMessage._id;
  targetChat.lastMessageText = previewText;
  targetChat.lastMessageAt = new Date();
  await targetChat.save();

  // Real-time Socket Broadcasts
  if (global.io) {
    const io = global.io;
    const chatRoom = `chat::${targetChat._id}`;
    const receiverRoom = `user::${actualReceiverId.toString()}`;
    const senderRoom = `user::${userId.toString()}`;

    // 1. Emit to active chat room (for open conversation view)
    io.to(chatRoom).emit('newMessage', populatedMessage);
    io.to(chatRoom).emit(`get message::${targetChat._id}`, populatedMessage);

    // Also emit directly to receiver's room so they receive newMessage anywhere
    io.to(receiverRoom).emit('newMessage', populatedMessage);

    // 2. Emit chat list update to receiver and sender (for inbox list screen)
    const chatListPayload = {
      chatId: targetChat._id,
      lastMessage: previewText,
      lastMessageAt: new Date(),
      lastMessageTime: formatMessageTime(new Date()),
      senderId: userId,
      senderName: populatedMessage.sender?.fullName || 'User',
      unreadCount: currentReceiverUnread + 1
    };

    io.to(receiverRoom).emit('chatListUpdate', chatListPayload);
    io.to(receiverRoom).emit('newMessageNotification', {
      chatId: targetChat._id,
      message: populatedMessage
    });

    io.to(senderRoom).emit('chatListUpdate', {
      ...chatListPayload,
      unreadCount: 0
    });
  }

  return populatedMessage;
};

/**
 * Mark all messages in a Chat as Read
 */
const markChatAsReadService = async (userId, chatId) => {
  if (!mongoose.Types.ObjectId.isValid(chatId)) {
    throw new ApiError(status.BAD_REQUEST, 'Invalid Chat ID');
  }

  const chat = await Chat.findById(chatId);
  if (!chat) {
    throw new ApiError(status.NOT_FOUND, 'Chat not found');
  }

  await Message.updateMany(
    { chatId, receiver: userId, isRead: false },
    { $set: { isRead: true, readAt: new Date() } }
  );

  if (chat.unreadCounts) {
    chat.unreadCounts.set(userId.toString(), 0);
    await chat.save();
  }

  if (global.io) {
    const readPayload = {
      chatId,
      readBy: userId,
      readAt: new Date()
    };

    // 1. Emit to chat room
    global.io.to(`chat::${chatId}`).emit('messagesRead', readPayload);

    // 2. Also emit to other participants' personal rooms
    const otherParticipants = (chat.participants || []).filter(
      (p) => p.toString() !== userId.toString()
    );
    otherParticipants.forEach((pId) => {
      global.io.to(`user::${pId.toString()}`).emit('messagesRead', readPayload);
    });

    // 3. Emit badge update to reader
    global.io.to(`user::${userId.toString()}`).emit('chatListUpdate', {
      chatId,
      unreadCount: 0
    });
  }

  return { message: 'Messages marked as read successfully' };
};

/**
 * Get Total Unread Count across all chats for a user
 */
const getTotalUnreadCountService = async (userId) => {
  const unreadTotal = await Message.countDocuments({
    receiver: userId,
    isRead: false
  });
  return { unreadCount: unreadTotal };
};

/**
 * Delete / Clear Chat
 */
const deleteChatService = async (userId, chatId) => {
  const chat = await Chat.findById(chatId);
  if (!chat) {
    throw new ApiError(status.NOT_FOUND, 'Chat not found');
  }

  const isParticipant = chat.participants.some(
    (p) => p.toString() === userId.toString()
  );
  if (!isParticipant) {
    throw new ApiError(status.FORBIDDEN, 'You are not authorized to delete this chat');
  }

  await Message.deleteMany({ chatId });
  await Chat.findByIdAndDelete(chatId);

  return { message: 'Chat and messages deleted successfully' };
};

module.exports = {
  createOrGetChatService,
  getMyConversationsService,
  getChatMessagesService,
  sendMessageService,
  markChatAsReadService,
  getTotalUnreadCountService,
  deleteChatService,
  isUserOnline
};
