const catchAsync = require('../../helpers/catchAsync');
const response = require('../../helpers/response');
const { status } = require('http-status');
const {
  createOrGetChatService,
  getMyConversationsService,
  getChatMessagesService,
  sendMessageService,
  markChatAsReadService,
  getTotalUnreadCountService,
  deleteChatService
} = require('./chat.service');

// 1. Create or Get 1-on-1 Chat Conversation
const createOrGetChat = catchAsync(async (req, res) => {
  const { participantId, receiverId, targetUserId, bookingId } = req.body;
  const targetId = participantId || receiverId || targetUserId;
  const chat = await createOrGetChatService(req.User._id, targetId, bookingId);

  return res.status(status.OK).json(
    response({
      status: 'OK',
      statusCode: status.OK,
      message: 'Chat conversation retrieved successfully',
      data: chat
    })
  );
});

// 2. Get My Conversations (Inbox List) - Figma Screen 1
const getMyConversations = catchAsync(async (req, res) => {
  const { search, page, limit } = req.query;
  const result = await getMyConversationsService(req.User._id, { search, page, limit });

  return res.status(status.OK).json(
    response({
      status: 'OK',
      statusCode: status.OK,
      message: 'Conversations retrieved successfully',
      data: result.conversations,
      pagination: result.pagination
    })
  );
});

// 3. Get Chat Messages History - Figma Screen 2
const getChatMessages = catchAsync(async (req, res) => {
  const { chatId } = req.params;
  const { page, limit } = req.query;
  const result = await getChatMessagesService(req.User._id, chatId, { page, limit });

  return res.status(status.OK).json(
    response({
      status: 'OK',
      statusCode: status.OK,
      message: 'Messages retrieved successfully',
      data: result
    })
  );
});

// 4. Send Message (REST API with file upload support)
const sendMessage = catchAsync(async (req, res) => {
  const { chatId } = req.params;
  const { receiverId, text, replyTo } = req.body;

  // Handle uploaded images and files
  let images = [];
  let files = [];

  if (req.files && Array.isArray(req.files)) {
    req.files.forEach((file) => {
      if (file.mimetype && file.mimetype.startsWith('image/')) {
        images.push(`/uploads/chat/${file.filename}`);
      } else {
        files.push({
          url: `/uploads/chat/${file.filename}`,
          name: file.originalname,
          size: file.size,
          mimeType: file.mimetype
        });
      }
    });
  } else if (req.file) {
    if (req.file.mimetype && req.file.mimetype.startsWith('image/')) {
      images.push(`/uploads/chat/${req.file.filename}`);
    } else {
      files.push({
        url: `/uploads/chat/${req.file.filename}`,
        name: req.file.originalname,
        size: req.file.size,
        mimeType: req.file.mimetype
      });
    }
  }

  // Also support URLs passed in body
  if (req.body.images && Array.isArray(req.body.images)) {
    images = images.concat(req.body.images);
  }
  if (req.body.files && Array.isArray(req.body.files)) {
    files = files.concat(req.body.files);
  }

  const message = await sendMessageService(req.User._id, {
    chatId: chatId || req.body.chatId,
    receiverId,
    text,
    images,
    files,
    voice: req.body.voice,
    replyTo
  });

  return res.status(status.CREATED).json(
    response({
      status: 'OK',
      statusCode: status.CREATED,
      message: 'Message sent successfully',
      data: message
    })
  );
});

// 5. Mark Chat as Read
const markChatAsRead = catchAsync(async (req, res) => {
  const { chatId } = req.params;
  const result = await markChatAsReadService(req.User._id, chatId);

  return res.status(status.OK).json(
    response({
      status: 'OK',
      statusCode: status.OK,
      message: result.message
    })
  );
});

// 6. Get Total Unread Count
const getTotalUnreadCount = catchAsync(async (req, res) => {
  const result = await getTotalUnreadCountService(req.User._id);

  return res.status(status.OK).json(
    response({
      status: 'OK',
      statusCode: status.OK,
      message: 'Total unread count retrieved successfully',
      data: result
    })
  );
});

// 7. Delete Chat Conversation
const deleteChat = catchAsync(async (req, res) => {
  const { chatId } = req.params;
  const result = await deleteChatService(req.User._id, chatId);

  return res.status(status.OK).json(
    response({
      status: 'OK',
      statusCode: status.OK,
      message: result.message
    })
  );
});

// 8. Upload Attachment for Chat (Simple and consistent format for all files)
const uploadAttachment = catchAsync(async (req, res) => {
  const rawFiles = req.files && Array.isArray(req.files)
    ? req.files
    : req.file
    ? [req.file]
    : [];

  const files = rawFiles.map((file) => `/uploads/chat/${file.filename}`);

  return res.status(status.OK).json({
    status: 'OK',
    statusCode: status.OK,
    message: 'Files uploaded successfully',
    data: files
  });
});

module.exports = {
  createOrGetChat,
  getMyConversations,
  getChatMessages,
  sendMessage,
  markChatAsRead,
  getTotalUnreadCount,
  deleteChat,
  uploadAttachment
};
