const jwt = require("jsonwebtoken");
const { tokenGenerator, refreshTokenGenerator, resetTokenGenerator } = require("../../helpers/tokenGenerator");
const catchAsync = require("../../helpers/catchAsync");
const response = require("../../helpers/response");
const { sendOTP, verifyOTP, checkOTPService } = require("../Otp/otp.service");
const {
  login,
  getUserByEmail,
  addUser,
  updateUserById,
  updateInstructorDocumentsService,
  createUserOnProfileSetupService,
  createInstructorOnDocumentSubmissionService,
  myDocumentsService,
  profileByIdService,
  getUserById,
  getUserByPhoneNumber,
  allUserService,
  deleteAccountService,
  socialLoginWithAppleService,
  socialLoginWithGoogleService,
  changePasswordService
} = require("./auth.service");
const { default: status } = require("http-status");
const ApiError = require("../../helpers/ApiError");
const unlinkImage = require('../../helpers/unlinkImage');
const userModel = require("../User/user.model");

const socialLoginWithAppleController = catchAsync(async (req, res) => {
  const result = await socialLoginWithAppleService(req.body);
  const accessToken = await tokenGenerator(result);

  return res.status(status.OK).json(response({
    status: 'success',
    statusCode: status.OK,
    message: "Login successful",
    data: result,
    accessToken
  }));
});

const socialLoginWithGoogleController = catchAsync(async (req, res) => {
  const result = await socialLoginWithGoogleService(req.body);
  const accessToken = await tokenGenerator(result);

  return res.status(status.OK).json(response({
    status: 'success',
    statusCode: status.OK,
    message: "Login successful",
    data: result,
    accessToken
  }));
});

// Login
const localAuth = catchAsync(async (req, res) => {
  const {
    email,
    number,
    countryCode,
    password,
  } = req.body;

  const hasEmail = !!email;
  const hasPhone = !!number || !!countryCode;

  if ((hasEmail && hasPhone) || (!hasEmail && !hasPhone)) {
    throw new ApiError(
      status.BAD_REQUEST,
      "Provide either email OR phone, not both"
    );
  }

  let user;

  if (email) {
    user = await login(
      { email },
      "email",
      password
    );
  } else {
    if (!number || !countryCode) {
      throw new ApiError(
        status.BAD_REQUEST,
        "Country code and phone number are required"
      );
    }

    user = await login(
      {
        number,
        countryCode,
      },
      "phone",
      password
    );
  }

  const token = await tokenGenerator(user);

  return res.status(status.OK).json(response({
    status: "OK",
    statusCode: status.OK,
    message: "Login successful",
    data: {
      _id: user._id,
      fullName: user.fullName,
      dob:user.dob,
      email: user.email,
      role: user.role,
      status: user.status,
      isVerified: user.isVerified,
      image: user.image
    },
    accessToken: token
  }));
});

// Sign up (Step 1 & 2: Role selection + email credentials)
const signUp = catchAsync(async (req, res) => {
  const { email, password, confirmPassword, role = 'user' } = req.body;
  const fullName = req.body.fullName || req.body.name || '';

  if (!role || !['user', 'instructor', 'admin'].includes(role)) {
    throw new ApiError(status.BAD_REQUEST, "Valid role ('user' or 'instructor') is required!");
  }

  if (!email) {
    throw new ApiError(status.BAD_REQUEST, "Email is required!");
  }

  if (!password) {
    throw new ApiError(status.BAD_REQUEST, "Password is required!");
  }

  if (confirmPassword && password !== confirmPassword) {
    throw new ApiError(status.BAD_REQUEST, "Password and Confirm Password do not match!");
  }

  const existingUser = await getUserByEmail(email);
  if (existingUser) {
    throw new ApiError(status.CONFLICT, "This email is already in use!");
  }

  let message = "";
  const existingOTP = await checkOTPService(email, "email");

  if (existingOTP) {
    message = "OTP already sent. Please check your email or wait for a few minutes to resend.";
  } else {
    const otpData = await sendOTP(
      fullName || (role === 'instructor' ? 'Instructor' : 'User'),
      email,
      "email",
      "email-verification"
    );
    message = otpData.message || "OTP sent to your email";
  }

  const signupPayload = {
    email: email.toLowerCase().trim(),
    password,
    role,
    ...(fullName && { fullName })
  };

  const accessToken = jwt.sign(
    signupPayload,
    process.env.JWT_ACCESS_TOKEN,
    { expiresIn: "1h" }
  );

  return res.status(status.CREATED).json(
    response({
      status: "OK",
      statusCode: status.CREATED,
      type: "user",
      message,
      accessToken,
    })
  );
});

// Validate OTP (Step 3: Verification)
const otpVerification = catchAsync(async (req, res) => {
  const email = req.User?.email || req.body.email;
  const purpose = req.body.purpose || req.User?.purpose || "email-verification";
  const otp = req.body.otp || req.body.oneTimeCode;

  if (!email) {
    throw new ApiError(status.BAD_REQUEST, "Email is required for verification");
  }

  if (!otp) {
    throw new ApiError(status.BAD_REQUEST, "OTP code is required");
  }

  const otpData = await verifyOTP(
    email,
    "email",
    purpose,
    otp
  );

  if (otpData && (purpose === "email-verification" || otpData.purpose === "email-verification")) {
    const role = req.body.role || req.User?.role || 'user';
    const password = req.body.password || req.User?.password;
    const fullName = req.body.fullName || req.User?.fullName || '';

    const verifiedPayload = {
      email: email.toLowerCase().trim(),
      role,
      ...(password && { password }),
      ...(fullName && { fullName }),
      isOtpVerified: true,
      purpose: 'onboarding'
    };

    const accessToken = jwt.sign(
      verifiedPayload,
      process.env.JWT_ACCESS_TOKEN,
      { expiresIn: "2h" }
    );

    const nextStep = role === 'instructor' ? 'setup-profile-then-documents' : 'setup-profile';

    return res.status(status.OK).json(
      response({
        status: "OK",
        statusCode: status.OK,
        type: role,
        message: "OTP verified successfully. Please complete your profile setup.",
        data: {
          email: verifiedPayload.email,
          role: verifiedPayload.role,
          fullName: verifiedPayload.fullName,
          isOtpVerified: true,
          nextStep
        },
        accessToken,
      })
    );
  }

  if (otpData && (purpose === "forget-password" || otpData.purpose === "forget-password")) {
    const user = await getUserByEmail(email);
    if (!user) {
      throw new ApiError(status.NOT_FOUND, "User not found");
    }

    const payload = {
      email: user.email,
      role: user.role,
      _id: user._id,
      fullName: user.fullName,
    };

    const resetToken = resetTokenGenerator(payload);

    return res.status(status.OK).json(
      response({
        status: "OK",
        statusCode: status.OK,
        type: user.role,
        message: "OTP verified successfully. You may now reset your password.",
        resetToken,
        token: resetToken,
        accessToken: resetToken,
      })
    );
  }

  throw new ApiError(status.BAD_REQUEST, "Invalid OTP purpose or code");
});

// Resend OTP
const resendOTP = catchAsync(async (req, res) => {
  const { email, receiverType = "email", purpose = "email-verification" } = req.body;

  if (!email) {
    throw new ApiError(status.BAD_REQUEST, "Email is required");
  }

  const otpData = await sendOTP(
    "User",
    email,
    receiverType,
    purpose
  );

  return res.status(status.OK).json(
    response({
      status: "OK",
      statusCode: status.OK,
      message: otpData.message || "OTP resent successfully",
    })
  );
});

// Forget Password (Screen 1: Enter email)
const forgetPassword = catchAsync(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    throw new ApiError(status.BAD_REQUEST, "Email is required");
  }

  const user = await getUserByEmail(email);
  if (!user) {
    throw new ApiError(status.NOT_FOUND, "No account found with this email");
  }

  const otpData = await sendOTP(
    user.fullName,
    user.email,
    "email",
    "forget-password"
  );

  const payload = {
    email: user.email,
    role: user.role,
    _id: user._id,
    fullName: user.fullName,
  };

  const token = jwt.sign(payload, process.env.JWT_ACCESS_TOKEN, {
    expiresIn: "1h",
  });

  return res.status(status.OK).json(
    response({
      status: "OK",
      statusCode: status.OK,
      message: "Password reset OTP sent to your email",
      accessToken: token
    })
  );
});

// Reset Password (Screen 3: Create New Password)
const resetPassword = catchAsync(async (req, res) => {
  const newPassword = req.body.password || req.body.newPassword;
  const confirmPassword = req.body.confirmPassword;
  const email = req.ResetUser?.email || req.User?.email || req.body.email;
  const userId = req.ResetUser?._id || req.User?._id;

  if (!email && !userId) {
    throw new ApiError(status.BAD_REQUEST, "User identification is missing. Please provide reset token.");
  }

  if (!newPassword) {
    throw new ApiError(status.BAD_REQUEST, "Password is required");
  }

  if (confirmPassword && newPassword !== confirmPassword) {
    throw new ApiError(status.BAD_REQUEST, "Passwords do not match");
  }

  const user = userId ? await getUserById(userId) : await getUserByEmail(email);
  if (!user) {
    throw new ApiError(status.NOT_FOUND, "User not found");
  }

  user.password = newPassword;
  await user.save();

  return res.status(status.OK).json(
    response({
      status: "OK",
      statusCode: status.OK,
      message: "Password reset successfully. Please login with your new password.",
    })
  );
});

// Change Password
const changePassword = catchAsync(async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  await changePasswordService(req.User._id, oldPassword, newPassword);

  return res.status(status.OK).json(
    response({
      status: "OK",
      statusCode: status.OK,
      message: "Password changed successfully",
    })
  );
});

// Update Profile (Step 4: Full Name, DOB, Avatar, About, etc.)
const updateProfile = catchAsync(async (req, res) => {
  const isExistingUser = req.dbUser || (req.User?._id && await getUserById(req.User._id));

  // Case A: Existing user in MongoDB updating their profile
  if (isExistingUser) {
    const user = isExistingUser;
    if (req.file) {
      const { filename } = req.file;
      if (filename && filename.length > 0) {
        const defaultPath1 = 'user.png';
        const defaultPath2 = 'user.jpg';

        if (user.image && user.image !== defaultPath1 && user.image !== defaultPath2 && !user.image.includes('default')) {
          unlinkImage(`uploads/users/${user.image}`);
        }
        req.body.image = filename;
      }
    }

    const result = await updateUserById(user._id, req.body);

    return res.status(status.OK).json(
      response({
        status: 'OK',
        statusCode: status.OK,
        type: result.role,
        message: 'Profile updated successfully',
        data: result
      })
    );
  }

  // Case B: Onboarding user (not in DB yet)
  if (!req.User || !req.User.isOtpVerified) {
    throw new ApiError(status.UNAUTHORIZED, "Please verify OTP before setting up your profile");
  }

  const role = req.body.role || req.User.role || 'user';

  // For Client / User: Profile setup is the FINAL onboarding step -> CREATE ACCOUNT IN DB
  if (role === 'user') {
    const createdUser = await createUserOnProfileSetupService(req.User, req.body, req.file);
    const accessToken = await tokenGenerator(createdUser);

    return res.status(status.CREATED).json(
      response({
        status: 'OK',
        statusCode: status.CREATED,
        type: 'user',
        message: 'Profile setup completed and user account created successfully',
        data: createdUser,
        accessToken
      })
    );
  }

  // For Instructor: Profile setup is an intermediate step -> SAVE ONBOARDING STATE, WAIT FOR DOCUMENTS
  if (role === 'instructor') {
    const profileImage = req.file ? req.file.filename : (req.body.image || req.User?.image || 'user.jpg');

    const experience = {
      years: req.body.experience?.years !== undefined ? Number(req.body.experience.years) : (req.body.experienceYears !== undefined ? Number(req.body.experienceYears) : (req.User?.experience?.years || 0)),
      description: req.body.experience?.description || req.body.experienceDescription || req.User?.experience?.description || '',
      referenceName: req.body.experience?.referenceName || req.body.referenceName || req.User?.experience?.referenceName || '',
      referenceContact: req.body.experience?.referenceContact || req.body.referenceContact || req.body.referencePhoneOrEmail || req.User?.experience?.referenceContact || ''
    };

    const instructorOnboardingPayload = {
      email: (req.User?.email || req.body.email || '').toLowerCase().trim(),
      ...( (req.User?.password || req.body.password) && { password: req.User?.password || req.body.password } ),
      role: 'instructor',
      fullName: req.body.fullName || req.User?.fullName || '',
      dob: req.body.dob || req.User?.dob || '',
      about: req.body.about || req.body.bio || req.User?.about || '',
      bio: req.body.bio || req.body.about || req.User?.bio || '',
      image: profileImage,
      instructorType: req.body.instructorType || req.User?.instructorType || 'certified',
      experience,
      ...(req.body.isWaiverAgreed !== undefined && { isWaiverAgreed: req.body.isWaiverAgreed }),
      ...(req.body.address && { address: req.body.address }),
      ...(req.body.number && { number: req.body.number }),
      ...(req.body.countryCode && { countryCode: req.body.countryCode }),
      isProfileSetupDone: true,
      isOtpVerified: true,
      purpose: 'onboarding'
    };

    const onboardingToken = jwt.sign(
      instructorOnboardingPayload,
      process.env.JWT_ACCESS_TOKEN,
      { expiresIn: "2h" }
    );

    return res.status(status.OK).json(
      response({
        status: 'OK',
        statusCode: status.OK,
        type: 'instructor',
        message: 'Instructor profile setup saved. Please submit your certification documents to complete account creation.',
        data: {
          fullName: instructorOnboardingPayload.fullName,
          dob: instructorOnboardingPayload.dob,
          about: instructorOnboardingPayload.about,
          image: instructorOnboardingPayload.image,
          instructorType: instructorOnboardingPayload.instructorType,
          experience: instructorOnboardingPayload.experience,
          nextStep: 'submit-documents'
        },
        accessToken: onboardingToken
      })
    );
  }

  throw new ApiError(status.BAD_REQUEST, "Invalid user role for profile setup");
});

// Instructor Onboarding & Document Uploads (Certificates, Waiver, CPR, First Aid, Background Check)
const updateDocuments = catchAsync(async (req, res) => {
  const isExistingInstructor = req.dbUser || (req.User?._id && await getUserById(req.User._id));

  // Case A: Existing instructor in MongoDB updating their documents
  if (isExistingInstructor) {
    const result = await updateInstructorDocumentsService(isExistingInstructor._id, req.body, req.files || {});

    return res.status(status.OK).json(
      response({
        status: 'OK',
        statusCode: status.OK,
        type: 'instructor',
        message: 'Instructor onboarding documents submitted successfully for verification',
        data: result
      })
    );
  }

  // Case B: Onboarding instructor (not in DB yet) -> CREATE INSTRUCTOR ACCOUNT IN DB
  if (!req.User || !req.User.isOtpVerified) {
    throw new ApiError(status.UNAUTHORIZED, "Please verify OTP and complete profile setup before submitting documents");
  }

  const createdInstructor = await createInstructorOnDocumentSubmissionService(req.User, req.body, req.files || {});
  const accessToken = await tokenGenerator(createdInstructor);

  return res.status(status.CREATED).json(
    response({
      status: 'OK',
      statusCode: status.CREATED,
      type: 'instructor',
      message: 'Instructor account created successfully and submitted for verification',
      data: createdInstructor,
      accessToken
    })
  );
});

// View My Documents & Verification Status
const myDocumentsController = catchAsync(async (req, res) => {
  const document = await myDocumentsService(req.User._id);
  return res.status(status.OK).json(
    response({
      status: 'OK',
      statusCode: status.OK,
      type: 'user',
      message: 'Documents and verification status fetched successfully',
      data: document
    })
  );
});

// Get My Profile
const userDetailsByID = catchAsync(async (req, res) => {
  const user = await profileByIdService(req.User._id);

  if (!user) {
    throw new ApiError(status.NOT_FOUND, "User not found");
  }

  return res.status(status.OK).json(
    response({
      statusCode: status.OK,
      message: "User details retrieved successfully",
      type: "user",
      data: user,
      status: "OK"
    })
  );
});

// Delete Account
const deleteAccountController = catchAsync(async (req, res) => {
  await deleteAccountService(req.User._id);
  return res.status(status.OK).json(
    response({
      status: 'OK',
      statusCode: status.OK,
      message: 'Account deleted successfully'
    })
  );
});

// All Users (Admin)
const allUserController = catchAsync(async (req, res) => {
  const options = {
    page: Number(req.query.page) || 1,
    limit: Number(req.query.limit) || 10,
    search: req.query.search || "",
    isBan: req.query.isBan,
    role: req.query.role
  };
  const result = await allUserService(options);
  return res.status(status.OK).json(
    response({
      status: "success",
      statusCode: status.OK,
      type: "user",
      message: "All users fetched successfully",
      data: result
    })
  );
});

module.exports = {
  localAuth,
  signUp,
  otpVerification,
  forgetPassword,
  resetPassword,
  changePassword,
  resendOTP,
  updateProfile,
  userDetailsByID,
  myDocumentsController,
  allUserController,
  deleteAccountController,
  updateDocuments,
  socialLoginWithAppleController,
  socialLoginWithGoogleController
};
