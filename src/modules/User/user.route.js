const express = require("express");
const router = express.Router();
const { tokenCheck, auth } = require("../../middlewares/auth");



const userFileUploadMiddleware = require("../../middlewares/fileUpload");
const UPLOADS_FOLDER_USERS = "./public/uploads/users";
const uploadUsers = userFileUploadMiddleware(UPLOADS_FOLDER_USERS);
const convertHeicToPng = require('../../middlewares/converter');
const ensureUploadFolderExists = require('../../helpers/fileExists');
const parseData = require('../../middlewares/parseData');
const { suspendUserController, activeUserController, addFlagController, addNoteController, addCreditController,checkServiceAvailability, fcmTokenController, deleteFcmTokenController, bulkAddFlagController, bulkAddNoteController, bulkAddCreditController, bulkSuspendUserController, bulkActiveUserController, togglePushNotificationController, getPushNotificationController } = require("./user.controller");
ensureUploadFolderExists(UPLOADS_FOLDER_USERS);

router.patch("/ban/:id", suspendUserController)
router.patch("/bulk-suspend",auth(['admin', 'sub_admin']),bulkSuspendUserController);
router.patch("/active/:id", activeUserController) 
router.patch("/bulk-active",auth(['admin', 'sub_admin']),bulkActiveUserController);
router.patch("/toggle-pushnotification",auth(['user', 'partner']), togglePushNotificationController)
router.patch("/flag/:id", addFlagController) 
router.patch("/bulk-flag", auth(['admin', 'sub_admin']), bulkAddFlagController);
router.patch("/note/:id", addNoteController) 
router.patch("/bulk-note", auth(['admin', 'sub_admin']), bulkAddNoteController);
router.patch("/add-credit/:id", addCreditController) 
router.patch("/bulk-credit", auth(['admin', 'sub_admin','sub_hr_admin', 'hr']), bulkAddCreditController);
router.get("/check-service-availability",auth(['partner']), checkServiceAvailability)
router.get("/get-pushnotification",auth(['user', 'partner']), getPushNotificationController)
router.post("/add-fcmToken", auth(['user', 'partner']), fcmTokenController);
router.delete("/delete-fcmToken", auth(['user', 'partner']), deleteFcmTokenController);

module.exports = router;

