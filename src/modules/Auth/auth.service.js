const ApiError = require('../../helpers/ApiError');
const User = require('../User/user.model');
const bcrypt = require('bcryptjs');
const { default: status } = require('http-status');
const userModel = require('../User/user.model');
const { tokenGenerator } = require('../../helpers/tokenGenerator');
const { verifyAppleToken, verifyGoogleToken } = require('../../helpers/verifyAppleToken');






const socialLoginWithAppleService = async (payload) => {
  const {
    accessToken,
    role,
    fullName,
  } = payload;

  // 1. Verify Apple Firebase ID Token
  const appleUser = await verifyAppleToken(accessToken);

  console.log(
    appleUser,
    "appleUser======>"
  );

  if (!appleUser) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      "Unable to verify Apple account"
    );
  }

  // 2. Find existing user using Apple ID
  let user = await User.findOne({
    appleId: appleUser.appleId,
  }).setOptions({
    ignoreDeleted: true,
  });

  // =================================================
  // EXISTING USER → SIGN IN
  // =================================================

  if (user) {
    if(user.isBan){
      throw new ApiError(
        httpStatus.FORBIDDEN,
        "This account is blocked"
      );
    }
    return user;
  }

  // =================================================
  // NEW USER → SIGN UP
  // =================================================


  const userData = {
    appleId: appleUser.appleId,
    email: appleUser.email,
    fullName:
      appleUser.name ||
      fullName ||
      "New User",
    password: appleUser.appleId,
    role,
    loginWith: "apple",
  };

  // 3. Create new user
  user = await User.create(userData);

  console.log(
    user,
    "New Apple user created"
  );

  if (!user) {
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      "User creation failed"
    );
  }

  // 4. Generate tokens
  return user;
};



const socialLoginWithGoogleService = async (payload) => {
  const {
    accessToken,
    role,
    fullName,
  } = payload;

  // 1. Verify Google Firebase ID Token
  const googleUser = await verifyGoogleToken(accessToken);

  if (!googleUser) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      "Unable to verify Google account"
    );
  }

  // 2. Find existing user using Google ID
  let user = await User.findOne({
    googleId: googleUser.googleId,
  }).setOptions({
    ignoreDeleted: true,
  });

  // ==========================================
  // EXISTING USER → SIGN IN
  // ==========================================

  if (user) {
    if (user.isBan) {
      throw new ApiError(
        httpStatus.FORBIDDEN,
        "This account is blocked"
      );
    }

    return user;
  }

  // ==========================================
  // NEW USER → SIGN UP
  // ==========================================

  const userData = {
    googleId: googleUser.googleId,
    email: googleUser.email,
    fullName:
      googleUser.name ||
      fullName ||
      "New User",
    password: googleUser.googleId,
    role,
    loginWith: "google",
  };

  // 3. Create new user
  user = await User.create(userData);

  if (!user) {
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      "User creation failed"
    );
  }

  // 4. Generate tokens
  return user;
};


const addUser = async (userBody) => {
  // console.log({ userBody });
  if (!userBody.fullName) {
    if (userBody.businessName) {
      userBody.fullName = userBody.businessName;
    } else {
      userBody.fullName = "User"; // fallback default
    }
  }
  // userBody.fullName = userBody.businessName ? userBody.businessName : userBody.fullName;
  const user = await userModel.create(userBody);
  if (userBody.role === 'partner') {
    const payload = {
      user: user._id,
      ...(userBody.businessName && { businessName: userBody.businessName }),
      ...(userBody.image && { image: userBody.image }),
      ...(userBody.category && { category: userBody.category }),
      ...(userBody.subcategory && { subcategory: userBody.subcategory }),
      ...(userBody.bankStatement && { bankStatement: userBody.bankStatement }),
      ...(userBody.businessCertification && { businessCertification: userBody.businessCertification }),
      ...(userBody.identityProof && { identityProof: userBody.identityProof }),
      ...(userBody.certificate && { certificate: userBody.certificate }),
    };
    // console.log({ payload })
    await addPartnerService(payload)
  }
  return user;
}


const deleteAccountService = async (id) => {

  const user = await userModel.findById(id);

  if (!user) {
    throw new Error("User not found");
  }

  // modify email if exists
  let updatedEmail = user.email;
  if (user.email) {
    updatedEmail = `deleted_${Date.now()}_${user.email}`;
  }

  // soft delete user
  const deletedUser = await userModel.findByIdAndUpdate(
    id,
    {
      isDeleted: true,
      email: updatedEmail,
    },
    { new: true }
  );

  // role-based delete
  if (user.role === 'partner') {
    await partnerModel.findOneAndUpdate(
      { user: id },
      { isDeleted: true },
      { new: true }
    );
  }

  if (user.role === 'hr') {
    await employerModel.findOneAndUpdate(
      { user: id },
      { isDeleted: true },
      { new: true }
    );
  }

  if (user.role === 'admin') {
    await adminModel.findOneAndDelete({ user: id });
  }

  return deletedUser;
};



const login = async (identifier, receiverType, inputPassword) => {
  let user;

  if (receiverType === "phone") {
    user = await userModel
      .findOne({
        number: identifier.number,
        countryCode: identifier.countryCode,
      })
      .select("+password");

    if (!user) {
      throw new ApiError(status.NOT_FOUND, "User not found");
    }
    if (["admin", "hr", "partner", "sub_admin", "sub_hr_admin"].includes(user.role)) {
      throw new ApiError(
        status.UNAUTHORIZED,
        "Invalid login credentials"
      );
    }
  }

  if (receiverType === "email") {
    user = await userModel
      .findOne({ email: identifier.email })
      .select("+password");
    // console.log("user2", user);

    if (!user) {
      throw new ApiError(status.NOT_FOUND, "User not found");
    }

    // if (user.role === "user") {
    //   throw new ApiError(
    //     status.UNAUTHORIZED,
    //     "User must login using phone number"
    //   );
    // }
  }

  if (!user) {
    throw new ApiError(status.NOT_FOUND, "User not found");
  }

  if (user.isDeleted) {
    throw new ApiError(status.NOT_FOUND, "User not found");
  }

  if (user.isBan) {
    throw new ApiError(status.FORBIDDEN, "User is banned");
  }

  const isMatch = await bcrypt.compare(
    inputPassword,
    user.password
  );

  if (!isMatch) {
    throw new ApiError(
      status.UNAUTHORIZED,
      "Invalid password"
    );
  }

  return user;
};


const changePasswordService = async (userId, oldPassword, newPassword) => {
  if (!oldPassword || !newPassword) {
    throw new ApiError(
      status.BAD_REQUEST,
      "Old password and new password are required"
    );
  }

  if (newPassword.length < 8) {
    throw new ApiError(
      status.BAD_REQUEST,
      "New password must be at least 8 characters"
    );
  }

  if (oldPassword === newPassword) {
    throw new ApiError(
      status.BAD_REQUEST,
      "New password must be different from old password"
    );
  }

  const user = await userModel
    .findById(userId)
    .select("+password");

  if (!user || user.isDeleted) {
    throw new ApiError(
      status.NOT_FOUND,
      "User not found"
    );
  }

  if (user.isBan) {
    throw new ApiError(
      status.FORBIDDEN,
      "User is banned"
    );
  }

  const isMatch = await bcrypt.compare(
    oldPassword,
    user.password
  );

  if (!isMatch) {
    throw new ApiError(
      status.UNAUTHORIZED,
      "Old password is incorrect"
    );
  }

  user.password = newPassword;

  // Invalidate existing login tokens
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  user.isLoginToken = false;

  await user.save();

  return user;
};

const getUserByEmail = async (email) => {
  return await userModel.findOne({ email });
}

const getUserByPhoneNumber = async (number, countryCode) => {
  return await userModel.findOne({
    number,
    countryCode,
  });
};

const getUserById = async (id) => {
  return await userModel.findById(id);
};

const updateUserById = async (id, data) => {
  console.log({id, data });
  const userPayload = {
    ...(data.fullName !== undefined && { fullName: data.fullName }),
    ...(data.image !== undefined && { image: data.image }),
    ...(data.email !== undefined && { email: data.email }),
    ...(data.location !== undefined && { location: data.location }),
    ...(data.address !== undefined && { address: data.address }),
    ...(data.number !== undefined && { number: data.number }),
    ...(data.countryCode !== undefined && { countryCode: data.countryCode }),
    ...(data.bio !== undefined && { bio: data.bio }),
    ...(data.about !== undefined && { about: data.about }),
    ...(data.experienceYears !== undefined && { experienceYears: Number(data.experienceYears) }),
    ...(data.certifications !== undefined && { certifications: data.certifications }),
    ...(data.lessonsTaught !== undefined && { lessonsTaught: Number(data.lessonsTaught) }),
  };
  const user = await userModel.findByIdAndUpdate(id, userPayload, { new: true });
  // console.log({ user });

  let partnerData = null;
  let companyData = null;

  if (user.role === 'partner') {

    const partnerPayload = {
      businessName: data.fullName,
      location: data.location,
      address: data.address,
      amenities: data.amenities,
      serviceAutoApproved: data.serviceAutoApproved,
      aboutUs: data.aboutUs
    };
    // console.log({ partnerPayload });

    partnerData = await partnerModel.findOneAndUpdate(
      { user: id },
      partnerPayload,
      { new: true }
    );
    // console.log({ partnerData });
  }

  if (user.role === 'hr') {
    companyData = await employerModel.findOneAndUpdate(
      { user: id },
      {
        companyName: data.fullName,
        contactName: data.managers
      },
      { new: true }
    );
  }
  // console.log({ user, partnerData, companyData });

  return {
    user,
    partner: partnerData,
    company: companyData
  };
};



const profileByIdService = async (userId) => {
  const user = await userModel.findById(userId);

  if (!user) return null;

  let partnerData = null;
  let companyData = null;

  if (user.role === 'partner') {
    partnerData = await partnerModel.findOne({ user: userId });
    console.log({ partnerData });
  }

  if (user.role === 'hr') {
    companyData = await employerModel.findOne({ user: userId });
  }

  return {
    user,
    partner: partnerData,
    company: companyData
  };
};


const allUserService = async (options) => {
  const { page = 1, limit = 10, search, isBan, role } = options;

  const skip = (page - 1) * limit;

  const searchMatch = search
    ? {
      $or: [
        { fullName: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { number: { $regex: search, $options: "i" } },
        { "companyData.companyName": { $regex: search, $options: "i" } },
        { role: { $regex: search, $options: "i" } },
      ],
    }
    : {};

  const banMatch =
    isBan !== undefined ? { isBan: isBan === "true" } : {};

  const roleMatch = role
    ? { role: { $in: role.split(",") } }
    : {};

  const aggregation = [
    {
      $match: {
        isDeleted: false,
        role: { $ne: "admin" },
        isVerified: false,
        ...banMatch,
        ...roleMatch,
      },
    },

    {
      $lookup: {
        from: "employees",
        localField: "_id",
        foreignField: "user",
        as: "employeeData",
      },
    },
    { $unwind: { path: "$employeeData", preserveNullAndEmptyArrays: true } },

    {
      $lookup: {
        from: "employers",
        localField: "employeeData.company",
        foreignField: "_id",
        as: "companyData",
      },
    },
    { $unwind: { path: "$companyData", preserveNullAndEmptyArrays: true } },

    { $match: searchMatch },

    { $sort: { createdAt: -1 } },

    {
      $facet: {
        data: [
          { $skip: skip },
          { $limit: limit },
          {
            $project: {
              _id: 1,
              fullName: 1,
              role: 1,
              number: 1,
              countryCode: 1,
              image: 1,
              email: 1,
              isBan: 1,
              note: 1,
              reportCount: 1,
              flagCount: 1,
              wallet: 1,
              bookingCompleted: 1,
              employer: "$companyData.companyName",
              totalRevenue: 1,
              digitalWallet: 1,
              status: 1,
              createdAt: 1,
            },
          },
        ],
        totalCount: [{ $count: "total" }],
      },
    },
  ];

  const result = await userModel.aggregate(aggregation);

  const data = result[0]?.data || [];
  const totalResults = result[0]?.totalCount[0]?.total || 0;

  return {
    result: data,
    pagination: {
      totalResults,
      totalPages: Math.ceil(totalResults / limit),
      currentPage: page,
    },
  };
};


module.exports = {
  login,
  addUser,
  getUserByEmail,
  getUserByPhoneNumber,
  getUserById,
  updateUserById,
  profileByIdService,
  allUserService,
  deleteAccountService,
  socialLoginWithAppleService,
  socialLoginWithGoogleService,
  changePasswordService
};
