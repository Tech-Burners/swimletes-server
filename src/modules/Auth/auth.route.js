const express = require("express");
const router = express.Router();
const { tokenCheck, auth, authOrOnboarding, resetTokenCheck } = require("../../middlewares/auth");

const userFileUploadMiddleware = require("../../middlewares/fileUpload");
const UPLOADS_FOLDER_USERS = "./public/uploads/users";
const uploadUsers = userFileUploadMiddleware(UPLOADS_FOLDER_USERS);
const convertHeicToPng = require('../../middlewares/converter');
const ensureUploadFolderExists = require('../../helpers/fileExists');
const parseData = require('../../middlewares/parseData');
const {
  localAuth,
  userDetailsByID,
  forgetPassword,
  resendOTP,
  resetPassword,
  changePassword,
  updateProfile,
  otpVerification,
  signUp,
  deleteAccountController,
  updateDocuments,
  myDocumentsController,
  socialLoginWithAppleController,
  socialLoginWithGoogleController
} = require("./auth.controller");

ensureUploadFolderExists(UPLOADS_FOLDER_USERS);

// 1. Authentication
router.post("/signin", localAuth);
router.post("/google-login", socialLoginWithGoogleController);
router.post("/apple-login", socialLoginWithAppleController);

// 2. Sign Up & OTP Verification (User & Instructor)
router.post("/sign-up", signUp);
router.post("/verify-otp", tokenCheck, otpVerification);
router.post("/resend-otp", resendOTP);

// 3. Password Management
router.post("/forget-password", forgetPassword);
router.post("/reset-password", resetTokenCheck, resetPassword);
router.patch("/change-password", auth(['user', 'instructor', 'admin']), changePassword);

// 4. Profile Setup & Management (Step 4 for User & Instructor)
router.get('/my-profile', auth(['user', 'instructor', 'admin']), userDetailsByID);
router.put(
  '/update-profile',
  authOrOnboarding(['user', 'instructor', 'admin']),
  uploadUsers.single('image'),
  convertHeicToPng(UPLOADS_FOLDER_USERS),
  parseData(),
  updateProfile
);
router.post(
  '/setup-profile',
  authOrOnboarding(['user', 'instructor', 'admin']),
  uploadUsers.single('image'),
  convertHeicToPng(UPLOADS_FOLDER_USERS),
  parseData(),
  updateProfile
);

// 5. Instructor Onboarding & Verification Documents
router.post(
  "/update-documents",
  authOrOnboarding(['user', 'instructor', 'admin']),
  uploadUsers.any(),
  convertHeicToPng(UPLOADS_FOLDER_USERS),
  parseData(),
  updateDocuments
);

router.post(
  "/instructor-documents",
  authOrOnboarding(['user', 'instructor', 'admin']),
  uploadUsers.any(),
  convertHeicToPng(UPLOADS_FOLDER_USERS),
  parseData(),
  updateDocuments
);

router.post(
  "/instructor/onboarding",
  authOrOnboarding(['user', 'instructor', 'admin']),
  uploadUsers.any(),
  convertHeicToPng(UPLOADS_FOLDER_USERS),
  parseData(),
  updateDocuments
);

router.get(
  "/my-documents",
  auth(['user', 'instructor', 'admin']),
  myDocumentsController
);

// 6. Account Deletion
router.patch("/delete-account", auth(['user', 'instructor', 'admin']), deleteAccountController);

module.exports = router;
