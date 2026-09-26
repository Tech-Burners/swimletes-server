const express = require("express");
const router = express.Router();
const { tokenCheck, auth } = require("../../middlewares/auth");



const userFileUploadMiddleware = require("../../middlewares/fileUpload");
const UPLOADS_FOLDER_USERS = "./public/uploads/users";
const uploadUsers = userFileUploadMiddleware(UPLOADS_FOLDER_USERS);
const convertHeicToPng = require('../../middlewares/converter');
const ensureUploadFolderExists = require('../../helpers/fileExists');
const parseData = require('../../middlewares/parseData');
const {
  suspendUserController,
  banUserController,
  activeUserController,
  addFlagController,
  addNoteController,
  addCreditController,
  checkServiceAvailability,
  fcmTokenController,
  deleteFcmTokenController,
  bulkAddFlagController,
  bulkAddNoteController,
  bulkAddCreditController,
  bulkSuspendUserController,
  bulkActiveUserController,
  togglePushNotificationController,
  getPushNotificationController,
  getUserHomeController,
  getInstructorHomeController,
  updateUserLocationController,
  getAdminClientsListController,
  getAdminClientDetailsController,
  getAdminClientReviewsController,
  updateClientStatusController,
  getAdminInstructorsListController,
  getAdminInstructorDetailsController,
  getAdminInstructorReviewsController,
  updateInstructorStatusController
} = require("./user.controller");
ensureUploadFolderExists(UPLOADS_FOLDER_USERS);

// User Home / Dashboard (Top Rated Instructors Near You - Figma 40010003:11)
router.get("/home", tokenCheck, getUserHomeController);
router.get("/top-instructors", tokenCheck, getUserHomeController);

// Instructor Home / Dashboard (Figma 40012288:1871)
router.get("/instructor/home", tokenCheck, getInstructorHomeController);
router.get("/home-instructor", tokenCheck, getInstructorHomeController);
router.get("/instructor-home", tokenCheck, getInstructorHomeController);

router.patch("/location", auth(['user', 'instructor', 'admin']), updateUserLocationController);
router.patch("/update-location", auth(['user', 'instructor', 'admin']), updateUserLocationController);

// ==================== Admin Clients Management & Drawers (Figma 40012554:16625, 40012525:10033, 40012525:10665) ====================
router.get("/admin/clients", tokenCheck, getAdminClientsListController);
router.get("/admin/clients/:id", tokenCheck, getAdminClientDetailsController);
router.get("/admin/clients/:id/reviews", tokenCheck, getAdminClientReviewsController);
router.patch("/admin/clients/:id/status", tokenCheck, updateClientStatusController);
router.patch("/admin/clients/:id/suspend", tokenCheck, suspendUserController);
router.patch("/admin/clients/:id/ban", tokenCheck, banUserController);
router.patch("/admin/clients/:id/active", tokenCheck, activeUserController);

// ==================== Admin Instructors Management & Drawers (Figma 40012554:17155, 40012525:13366, 40012525:14227) ====================
router.get("/admin/instructors", tokenCheck, getAdminInstructorsListController);
router.get("/admin/instructors/:id", tokenCheck, getAdminInstructorDetailsController);
router.get("/admin/instructors/:id/reviews", tokenCheck, getAdminInstructorReviewsController);
router.patch("/admin/instructors/:id/status", tokenCheck, updateInstructorStatusController);
router.patch("/admin/instructors/:id/suspend", tokenCheck, suspendUserController);
router.patch("/admin/instructors/:id/ban", tokenCheck, banUserController);
router.patch("/admin/instructors/:id/active", tokenCheck, activeUserController);

// Direct Actions
router.patch("/suspend/:id", suspendUserController);
router.patch("/ban/:id", banUserController);
router.patch("/bulk-suspend", auth(['admin', 'sub_admin']), bulkSuspendUserController);
router.patch("/active/:id", activeUserController);
router.patch("/bulk-active", auth(['admin', 'sub_admin']), bulkActiveUserController);
router.patch("/toggle-pushnotification", auth(['user', 'partner']), togglePushNotificationController);
router.patch("/flag/:id", addFlagController);
router.patch("/bulk-flag", auth(['admin', 'sub_admin']), bulkAddFlagController);
router.patch("/note/:id", addNoteController);
router.patch("/bulk-note", auth(['admin', 'sub_admin']), bulkAddNoteController);
router.patch("/add-credit/:id", addCreditController);
router.patch("/bulk-credit", auth(['admin', 'sub_admin', 'sub_hr_admin', 'hr']), bulkAddCreditController);
router.get("/check-service-availability", auth(['partner']), checkServiceAvailability);
router.get("/get-pushnotification", auth(['user', 'partner']), getPushNotificationController);
router.post("/add-fcmToken", auth(['user', 'partner']), fcmTokenController);
router.delete("/delete-fcmToken", auth(['user', 'partner']), deleteFcmTokenController);

module.exports = router;

