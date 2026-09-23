const express = require('express');
const router = express.Router();
const { auth } = require('../../middlewares/auth');
const userFileUploadMiddleware = require('../../middlewares/fileUpload');
const ensureUploadFolderExists = require('../../helpers/fileExists');
const parseData = require('../../middlewares/parseData');
const convertHeicToPng = require('../../middlewares/converter');

const UPLOADS_FOLDER_CHAT = './public/uploads/chat';
ensureUploadFolderExists(UPLOADS_FOLDER_CHAT);
const uploadChat = userFileUploadMiddleware(UPLOADS_FOLDER_CHAT);

const {
  createOrGetChat,
  getMyConversations,
  getChatMessages,
  sendMessage,
  markChatAsRead,
  getTotalUnreadCount,
  deleteChat,
  uploadAttachment
} = require('./chat.controller');

// All chat routes require user, instructor, or admin auth
router.use(auth(['user', 'instructor', 'admin']));

// 1. Conversations / Inbox (Screen 1 in Figma: 40012257:2626)
router.get('/conversations', getMyConversations);
router.get('/my-chats', getMyConversations);
router.get('/unread-count', getTotalUnreadCount);

// 2. Start or Get Chat
router.post('/create-or-get', createOrGetChat);
router.post('/initiate', createOrGetChat);

// 3. Messages History & Sending (Screen 2 in Figma: 40012262:7458)
router.get('/:chatId/messages', getChatMessages);
router.post(
  '/upload-attachment',
  uploadChat.any(),
  convertHeicToPng(UPLOADS_FOLDER_CHAT),
  parseData(),
  uploadAttachment
);
router.post(
  '/:chatId/message',
  uploadChat.any(),
  convertHeicToPng(UPLOADS_FOLDER_CHAT),
  parseData(),
  sendMessage
);
router.post(
  '/send-message',
  uploadChat.any(),
  convertHeicToPng(UPLOADS_FOLDER_CHAT),
  parseData(),
  sendMessage
);

// 4. Mark Read & Delete
router.patch('/:chatId/read', markChatAsRead);
router.delete('/:chatId', deleteChat);

module.exports = router;
