const jwt = require("jsonwebtoken");
const { tokenGenerator, refreshTokenGenerator, resetTokenGenerator } = require("../../helpers/tokenGenerator");
const catchAsync = require("../../helpers/catchAsync");
const response = require("../../helpers/response");
const { sendOTP, verifyOTP, checkOTPService } = require("../Otp/otp.service");
const { login, getUserByEmail, addUser, updateUserById,
   profileByIdService, getUserById, getUserByPhoneNumber,
  allUserService,
  deleteAccountService,
  socialLoginWithAppleService,
  socialLoginWithGoogleService,
  changePasswordService } = require("./auth.service");
const { default: status } = require("http-status");
const ApiError = require("../../helpers/ApiError");
const unlinkImage = require('../../helpers/unlinkImage');
const userModel = require("../User/user.model");






const socialLoginWithAppleController = catchAsync(async (req, res) => {
  const result = await socialLoginWithAppleService(req.body);
  const accessToken = await tokenGenerator(result);

  return res.status(status.OK).json(response({
    status: 'success',
    statusCode: status.OK, message: "User created successfully",
    data: result, accessToken
  }));
});




const socialLoginWithGoogleController = catchAsync(async (req, res) => {
  const result = await socialLoginWithGoogleService(req.body);
  const accessToken = await tokenGenerator(result);

  return res.status(status.OK).json(response({
    status: 'success',
    statusCode: status.OK, message: "User created successfully",
    data: result, accessToken
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
    // console.log("user1", user);
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

  // console.log({ user });
  let admin;
  // if (user.role === 'admin' || user.role === 'hr') {
  if (['admin', 'hr', 'sub_hr_admin', 'sub_admin'].includes(user.role)) {
    // console.log("role", user.role)
    admin = await getAdminByUserId(user._id);
  }
  const token = await tokenGenerator(user, admin);
  const refreshToken = refreshTokenGenerator(user);

  return res.status(status.OK).json(response({
    status: "OK",
    statusCode: status.OK,
    message: "Login successful",
    data: {
      _id: user._id,
      email: user.email,
      number: user.number,
      countryCode: user.countryCode,
      fullName: user.fullName,
      role: user.role,
      image: user.image,
      isVerified: user.isVerified,
      categoryPermissions: admin?.categoryPermissions,
      parent: admin?.parent
    },
    accessToken: token,
    refreshToken: refreshToken
  }));
});


//Sign up
const signUp = catchAsync(async (req, res) => {

  const { email, role, fullName } = req.body;

  if (!role) {
    throw new ApiError(status.BAD_REQUEST, "Role is required!");
  }

  /* ---------- FILE HANDLE FIX ---------- */

  if (req.files) {

    if (req.files.image?.[0]) {
      req.body.image = req.files.image[0].filename;
    }

    // if (req.files.certificate?.[0]) {
    //   req.body.certificate = req.files.certificate[0].filename;
    // }

    // if (req.files.identityProof?.[0]) {
    //   req.body.identityProof = req.files.identityProof[0].filename;
    // }

    // if (req.files.businessCertification?.[0]) {
    //   req.body.businessCertification = req.files.businessCertification[0].filename;
    // }

    // if (req.files.bankStatement?.[0]) {
    //   req.body.bankStatement = req.files.bankStatement[0].filename;
    // }
  }

  let sentTo;
  let receiverType;
  let existingOTP;

  if (!email) {
    throw new ApiError(status.BAD_REQUEST, "Email is required!");
  }

  const existingUser = await getUserByEmail(email);

  if (existingUser) {
    throw new ApiError(status.CONFLICT, "This email already used!");
  }

  sentTo = email;
  receiverType = "email";
  existingOTP = await checkOTPService(email, "email");

  let message = "";

  if (existingOTP) {
    message = "OTP already sent. Please wait for a few minutes.";
  } else {
    const otpData = await sendOTP(
      fullName,
      sentTo,
      receiverType,
      "email-verification"
    );

    message = otpData.message;
  }

  const accessToken = jwt.sign(
    { ...req.body },
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




const updateDocuments = catchAsync(async (req, res) => {
  if (req.files) {
    if (req.files.image?.[0]) {
      req.body.image = req.files.image[0].filename;
    }

    if (req.files.certificate?.[0]) {
      req.body.certificate = req.files.certificate[0].filename;
    }

    if (req.files.identityProof?.[0]) {
      req.body.identityProof = req.files.identityProof[0].filename;
    }

    if (req.files.businessCertification?.[0]) {
      req.body.businessCertification = req.files.businessCertification[0].filename;
    }

    if (req.files.bankStatement?.[0]) {
      req.body.bankStatement = req.files.bankStatement[0].filename;
    }
  }
  const result = await updateDocumentsService(req.User._id, req.body);
  return res.status(status.OK).json(response({
    status: 'OK', statusCode: status.OK,
    type: 'user', message: 'documents updated successfully'
  }));
});




const allUserController = catchAsync(async (req, res) => {
  const options = {
    page: Number(req.query.page) || 1,
    limit: Number(req.query.limit) || 10,
    search: req.query.search || "",
    isBan: req.query.isBan,
    role: req.query.role
  }
  const result = await allUserService(options);
  return res.status(status.OK).json(
    response({
      status: "success",
      statusCode: status.OK,
      type: "user",
      message: "all user fetched successfully",
      data: result
    })
  );
});


// Validate OTP
const otpVerification = catchAsync(async (req, res) => {
  const email = req.User?.email || req.body.email;

  let otpData;

  if (email) {
    otpData = await verifyOTP(
      email,
      "email",
      req.body.purpose,
      req.body.otp
    );
  }

  if (otpData && otpData.purpose === "email-verification") {
    const registeredUser = await addUser(req.User);

    const accessToken = await tokenGenerator(registeredUser);

    return res.status(status.CREATED).json(
      response({
        status: "OK",
        statusCode: status.CREATED,
        type: "user",
        message: "Verified",
        data: registeredUser,
        accessToken,
      })
    );
  }

  if (otpData && otpData.purpose === "forget-password") {
    let user;

    if (email) {
      user = await getUserByEmail(email);
    }

    if (fullPhoneNumber) {
      user = await userModel.findOne({
        number,
        countryCode,
      });
    }

    const accessToken = resetTokenGenerator(user);

    return res.status(status.OK).json(
      response({
        status: "OK",
        statusCode: status.OK,
        message: "OTP verified",
        accessToken,
      })
    );
  }
});




// Forget password
const forgetPassword = catchAsync(async (req, res) => {
  const { email, number, countryCode } = req.body;

  const hasEmail = !!email;
  const hasPhone = !!number || !!countryCode;

  if ((hasEmail && hasPhone) || (!hasEmail && !hasPhone)) {
    throw new ApiError(
      status.BAD_REQUEST,
      "Provide either email OR phone, not both"
    );
  }

  let user;
  let sentTo;
  let receiverType;

  if (email) {
    user = await getUserByEmail(email);

    if (!user) {
      throw new ApiError(status.NOT_FOUND, "User not found");
    }

    sentTo = email;
    receiverType = "email";
  } else {
    if (!number || !countryCode) {
      throw new ApiError(
        status.BAD_REQUEST,
        "Country code and phone number are required"
      );
    }

    user = await getUserByPhoneNumber(number, countryCode);

    if (!user) {
      throw new ApiError(status.NOT_FOUND, "User not found");
    }

    sentTo = `${countryCode}${number}`;
    receiverType = "phone";
  }

  const otpData = await sendOTP(
    user.fullName,
    sentTo,
    receiverType,
    "forget-password"
  );

  if (!otpData) {
    throw new ApiError(
      status.INTERNAL_SERVER_ERROR,
      "Failed to send OTP. Please try again."
    );
  }

  const message =
    receiverType === "email"
      ? "OTP sent to your email"
      : "OTP sent to your phone";

  const payload = {
    email: user.email,
    role: user.role,
    number: user.number,
    countryCode: user.countryCode,
    fullName: user.fullName,
  };

  const token = jwt.sign(payload, process.env.JWT_ACCESS_TOKEN, {
    expiresIn: "1h",
  });

  return res.status(status.OK).json(
    response({
      status: "OK",
      statusCode: status.OK,
      type: "user",
      message,
      data: token,
    })
  );
});


const resetPassword = catchAsync(async (req, res) => {

  const user = await getUserById(req.ResetUser._id);
  // console.log({ user });

  if (!user)
    throw new ApiError(404, "User not found");

  user.password = req.body.password;
  user.tokenVersion = user.tokenVersion + 1;

  await user.save();

  return res.status(200).json(
    response({
      status: "OK",
      statusCode: status.OK,
      type: "user",
      message: "Password reset successful"
    }));
});




const deleteAccountController = catchAsync(async (req, res) => {
  const result = await deleteAccountService(req.User._id);
  return res.status(status.OK).json(response({ status: 'OK', statusCode: status.OK, type: 'user', message: 'account deleted successfully', data: result }));
})


const changePassword = catchAsync(async (req, res) => {
  const { oldPassword, newPassword } = req.body;

  await changePasswordService(
    req.User._id,
    oldPassword,
    newPassword
  );

  return res.status(status.OK).json(
    response({
      status: "OK",
      statusCode: status.OK,
      type: "user",
      message: "Password changed successfully",
    })
  );
});


const resendOTP = catchAsync(async (req, res) => {
  const { email, purpose, phoneNumber } = req.body;
  let user;
  if (email) {
    user = await getUserByEmail(email);

    const fullName = user?.fullName || "User";
    const otpData = await sendOTP(fullName, email, "email", purpose);
    if (otpData) { return res.status(status.OK).json(response({ status: "OK", statusCode: status.OK, type: "user", message: 'otp resent to  email' })); }
  }
  if (phoneNumber) {
    user = await getUserByPhoneNumber(phoneNumber);

    const fullName = user?.fullName || "User";
    const otpData = await sendOTP(fullName, phoneNumber, "phone", purpose);
    if (otpData) { return res.status(status.OK).json(response({ status: "OK", statusCode: status.OK, type: "user", message: 'otp resent to phone' })); }
  }

});




const updateProfile = catchAsync(async (req, res) => {
  const user = await getUserById(req.User._id);
  if (!user) throw new ApiError(status.NOT_FOUND, 'user not found');

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
  // console.log("controileer", req.body)

  const result = await updateUserById(user._id, req.body);

  let formattedData;

  //  ROLE BASED RESPONSE
  if (user.role === 'partner') {
    formattedData = {
      businessName: result.partner?.businessName,
      aboutUs: result.partner?.aboutUs,
      location: result.user?.location,
      address: result.user?.address,
      amenities: result.partner?.amenities,
      serviceAutoApproved: result.partner?.serviceAutoApproved,
      // whatsappNumber: result.user.whatsappNumber,
      number: result.user.number,
      countryCode: result.user.countryCode,
      image: result.user.image
    };
  }

  else if (user.role === 'admin') {
    formattedData = {
      name: result.user.fullName,
      image: result.user.image,
      email: result.user.email
    };
  }

  else if (user.role === 'hr') {
    formattedData = {
      companyName: result.company?.companyName,
      image: result.user.image,
      manager: result.company?.contactName,
      email: result.user.email,
      number: result.user.number,
      countryCode: result.user.countryCode
    };
  }

  else {
    formattedData = {
      name: result.user.fullName,
      email: result.user.email,
      image: result.user.image,
      number: result.user.number,
      countryCode: result.user.countryCode,
      address: result.user.address,
      location: result.user.location
    };
  }

  return res.status(status.OK).json(
    response({
      status: 'OK',
      statusCode: status.OK,
      type: 'user',
      message: 'profile updated successfully',
      data: formattedData
    })
  );
});




const myDocumentsController = catchAsync(async (req, res) => {
  const document = await myDocumentsService(req.User._id);
  return res.status(status.OK).json(response({ status: 'OK', statusCode: status.OK, type: 'user', message: 'documents fetched successfully', data: document }));
});


const userDetailsByID = catchAsync(async (req, res) => {
  const result = await profileByIdService(req.User._id);
  // console.log({ result });

  if (!result) {
    throw new ApiError(status.NOT_FOUND, "User not found");
  }

  let formattedData;

  if (result.user.role === 'partner') {
    formattedData = {
      businessName: result.partner?.businessName,
      aboutUs: result.partner?.aboutUs,
      location: result.user?.location,
      address: result.user?.address,
      amenities: result.partner?.amenities,
      number: result.user?.number,
      countryCode: result.user?.countryCode,
      serviceAutoApproved: result.partner?.serviceAutoApproved,
      // whatsappNumber: result.user.whatsappNumber,
      number: result.user.number,
      countryCode: result.user.countryCode,
      image: result.user.image,
      isVerified: result.user.isVerified
    };
  }

  else if (result.user.role === 'admin') {
    formattedData = {
      name: result.user.fullName,
      image: result.user.image,
      email: result.user.email
    };
  }

  else if (result.user.role === 'hr') {
    formattedData = {
      companyName: result.company?.companyName,
      image: result.user.image,
      manager: result.company?.contactName,
      email: result.user.email,
      number: result.user.number,
      countryCode: result.user.countryCode
    };
  }

  else {
    formattedData = {
      name: result.user.fullName,
      email: result.user.email,
      image: result.user.image,
      number: result.user.number,
      countryCode: result.user.countryCode,
      address: result.user.address,
      location: result.user.location
    };
  }

  return res.status(status.OK).json(
    response({
      statusCode: status.OK,
      message: "User details",
      type: "user",
      data: formattedData,
      status: "OK"
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
