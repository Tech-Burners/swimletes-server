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
    role = 'user',
    fullName,
  } = payload;

  // 1. Verify Apple Firebase ID Token
  const appleUser = await verifyAppleToken(accessToken);

  if (!appleUser) {
    throw new ApiError(
      status.FORBIDDEN,
      "Unable to verify Apple account"
    );
  }

  // 2. Find existing user using Apple ID
  let user = await User.findOne({
    appleId: appleUser.appleId,
  });

  if (user) {
    if (user.isBan) {
      throw new ApiError(
        status.FORBIDDEN,
        "This account is blocked"
      );
    }
    return user;
  }

  // 3. Create new user
  const isInstructor = role === 'instructor';
  const userData = {
    appleId: appleUser.appleId,
    email: appleUser.email,
    fullName:
      appleUser.name ||
      fullName ||
      (isInstructor ? "New Instructor" : "New User"),
    password: appleUser.appleId,
    role,
    status: isInstructor ? 'pending' : 'active',
    isVerified: !isInstructor,
    loginWith: "apple",
  };

  user = await User.create(userData);

  if (!user) {
    throw new ApiError(
      status.INTERNAL_SERVER_ERROR,
      "User creation failed"
    );
  }

  return user;
};

const socialLoginWithGoogleService = async (payload) => {
  const {
    accessToken,
    role = 'user',
    fullName,
  } = payload;

  // 1. Verify Google Firebase ID Token
  const googleUser = await verifyGoogleToken(accessToken);

  if (!googleUser) {
    throw new ApiError(
      status.FORBIDDEN,
      "Unable to verify Google account"
    );
  }

  // 2. Find existing user using Google ID
  let user = await User.findOne({
    googleId: googleUser.googleId,
  });

  if (user) {
    if (user.isBan) {
      throw new ApiError(
        status.FORBIDDEN,
        "This account is blocked"
      );
    }
    return user;
  }

  // 3. Create new user
  const isInstructor = role === 'instructor';
  const userData = {
    googleId: googleUser.googleId,
    email: googleUser.email,
    fullName:
      googleUser.name ||
      fullName ||
      (isInstructor ? "New Instructor" : "New User"),
    password: googleUser.googleId,
    role,
    status: isInstructor ? 'pending' : 'active',
    isVerified: !isInstructor,
    loginWith: "google",
  };

  user = await User.create(userData);

  if (!user) {
    throw new ApiError(
      status.INTERNAL_SERVER_ERROR,
      "User creation failed"
    );
  }

  return user;
};

const addUser = async (userBody) => {
  if (!userBody.fullName) {
    userBody.fullName = userBody.role === 'instructor' ? "Instructor" : "User";
  }

  if (userBody.role === 'instructor') {
    userBody.isVerified = false;
    userBody.status = 'pending';
  } else if (userBody.role === 'user') {
    userBody.isVerified = true;
    userBody.status = 'active';
  }

  const user = await userModel.create(userBody);
  return user;
};

const deleteAccountService = async (id) => {
  const user = await userModel.findById(id);

  if (!user) {
    throw new ApiError(status.NOT_FOUND, "User not found");
  }

  let updatedEmail = user.email;
  if (user.email) {
    updatedEmail = `deleted_${Date.now()}_${user.email}`;
  }

  const deletedUser = await userModel.findByIdAndUpdate(
    id,
    {
      isDeleted: true,
      email: updatedEmail,
    },
    { new: true }
  );

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
  }

  if (receiverType === "email") {
    user = await userModel
      .findOne({ email: identifier.email.toLowerCase().trim() })
      .select("+password");

    if (!user) {
      throw new ApiError(status.NOT_FOUND, "User not found");
    }
  }

  if (!user) {
    throw new ApiError(status.NOT_FOUND, "User not found");
  }

  if (user.isDeleted) {
    throw new ApiError(status.NOT_FOUND, "User account is deleted");
  }

  if (user.isBan) {
    throw new ApiError(status.FORBIDDEN, "User account is suspended/banned");
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

  if (newPassword.length < 6) {
    throw new ApiError(
      status.BAD_REQUEST,
      "New password must be at least 6 characters"
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
  await user.save();

  return user;
};

const getUserByEmail = async (email) => {
  if (!email) return null;
  return await userModel.findOne({ email: email.toLowerCase().trim() });
};

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
  const userPayload = {
    ...(data.fullName !== undefined && { fullName: data.fullName }),
    ...(data.dob !== undefined && { dob: data.dob }),
    ...(data.dateOfBirth !== undefined && { dateOfBirth: data.dateOfBirth, dob: data.dateOfBirth }),
    ...(data.image !== undefined && { image: data.image }),
    ...(data.email !== undefined && { email: data.email }),
    ...(data.location !== undefined && { location: data.location }),
    ...(data.address !== undefined && { address: data.address }),
    ...(data.number !== undefined && { number: data.number }),
    ...(data.countryCode !== undefined && { countryCode: data.countryCode }),
    ...(data.bio !== undefined && { bio: data.bio }),
    ...(data.about !== undefined && { about: data.about }),
    ...(data.experienceYears !== undefined && { experienceYears: Number(data.experienceYears) }),
    ...(data.instructorType !== undefined && { instructorType: data.instructorType }),
    ...(data.certifications !== undefined && { certifications: data.certifications }),
    ...(data.lessonsTaught !== undefined && { lessonsTaught: Number(data.lessonsTaught) }),
  };

  const user = await userModel.findByIdAndUpdate(id, userPayload, { new: true });
  return user;
};

/**
 * Helper to safely extract uploaded file across various field names and formats (array from .any() or object from .fields())
 */
const getUploadedFile = (files, ...fieldNames) => {
  if (!files) return null;
  if (Array.isArray(files)) {
    for (const name of fieldNames) {
      const found = files.find(f => f.fieldname === name || f.fieldname.toLowerCase() === name.toLowerCase());
      if (found) return found;
    }
    return null;
  }
  for (const name of fieldNames) {
    if (files[name]?.[0]) return files[name][0];
    if (files[name] && !Array.isArray(files[name])) return files[name];
    const key = Object.keys(files).find(k => k.toLowerCase() === name.toLowerCase());
    if (key && files[key]?.[0]) return files[key][0];
    if (key && files[key] && !Array.isArray(files[key])) return files[key];
  }
  return null;
};

/**
 * Handle instructor onboarding documents submission:
 * - Certifications (for certified instructors)
 * - Additional liability waiver (for experience-based instructors)
 * - CPR/AED and First Aid certifications
 * - Background check ID and document verification
 */
const updateInstructorDocumentsService = async (userId, data, files = {}) => {
  const user = await userModel.findById(userId);
  if (!user) {
    throw new ApiError(status.NOT_FOUND, "User not found");
  }

  const updateFields = {};

  // 1. Instructor Type
  if (data.instructorType) {
    updateFields.instructorType = data.instructorType;
  }

  // 2. Profile Photo (if included in onboarding)
  const profileImageFile = getUploadedFile(files, 'image', 'avatar', 'photo', 'profileImage');
  if (profileImageFile) {
    updateFields.image = profileImageFile.filename;
  }

  // 3. Swim Instruction Certification (Path A: Certified)
  const certFile = getUploadedFile(files, 'certificate', 'certificates', 'certification', 'certificateFile', 'certFile', 'cert');
  if (data.instructorType === 'certified' || certFile || data.certificationName) {
    const certItem = {
      name: data.certificationName || (user.certificationsList?.[0]?.name || 'Water Safety Instructor Certification'),
      issuer: data.certificationIssuer || (user.certificationsList?.[0]?.issuer || 'American Red Cross'),
      expiryDate: data.certificationExpiryDate || (user.certificationsList?.[0]?.expiryDate || ''),
      fileName: certFile?.filename || (user.certificationsList?.[0]?.fileName || ''),
      fileUrl: certFile ? `/uploads/users/${certFile.filename}` : (user.certificationsList?.[0]?.fileUrl || '')
    };
    updateFields.certificationsList = [certItem];
    updateFields.certifications = certItem.name;
  }

  // 4. Additional Liability Waiver (Path B: Experience-Based)
  if (data.instructorType === 'experience_based' || data.isWaiverAgreed !== undefined) {
    const isAgreed = data.isWaiverAgreed === true || data.isWaiverAgreed === 'true';
    updateFields.experienceWaiver = {
      isAgreed,
      agreedAt: isAgreed ? new Date() : (user.experienceWaiver?.agreedAt || null)
    };
  }

  // 5. CPR / AED Certification
  const cprFile = getUploadedFile(files, 'cprCertificate', 'cprFile', 'cpr', 'cprCert', 'cprDoc');
  if (cprFile || data.cprName) {
    updateFields.cprCertification = {
      name: data.cprName || 'CPR/AED Certification',
      issuer: data.cprIssuer || '',
      expiryDate: data.cprExpiryDate || '',
      fileName: cprFile ? cprFile.filename : (user.cprCertification?.fileName || ''),
      fileUrl: cprFile ? `/uploads/users/${cprFile.filename}` : (user.cprCertification?.fileUrl || '')
    };
  }

  // 6. First Aid Certification
  const firstAidFile = getUploadedFile(files, 'firstAidCertificate', 'firstAidFile', 'firstAid', 'firstaid', 'firstaidCert', 'firstAidDoc');
  if (firstAidFile || data.firstAidName) {
    updateFields.firstAidCertification = {
      name: data.firstAidName || 'First Aid Certification',
      issuer: data.firstAidIssuer || '',
      expiryDate: data.firstAidExpiryDate || '',
      fileName: firstAidFile ? firstAidFile.filename : (user.firstAidCertification?.fileName || ''),
      fileUrl: firstAidFile ? `/uploads/users/${firstAidFile.filename}` : (user.firstAidCertification?.fileUrl || '')
    };
  }

  // 7. Background Check & ID Document
  const bgDoc = getUploadedFile(files, 'identityProof', 'backgroundDocument', 'document', 'identityDocument', 'idProof', 'idDocument', 'doc', 'idCard');
  const isConsent = data.isConsentConfirmed === true || data.isConsentConfirmed === 'true';

  if (data.idType || data.idNumber || bgDoc || isConsent) {
    updateFields.backgroundCheck = {
      idType: data.idType || (user.backgroundCheck?.idType || 'Social Security Number'),
      idNumber: data.idNumber || (user.backgroundCheck?.idNumber || ''),
      documentName: bgDoc ? bgDoc.originalname : (user.backgroundCheck?.documentName || ''),
      documentUrl: bgDoc ? `/uploads/users/${bgDoc.filename}` : (user.backgroundCheck?.documentUrl || ''),
      issuer: data.idIssuer || (user.backgroundCheck?.issuer || ''),
      isConsentConfirmed: isConsent,
      submittedAt: new Date(),
      status: 'pending' // Under review by admin
    };
    updateFields.status = 'pending';
    updateFields.isVerified = false;
  }

  // 8. General profile info if submitted alongside
  if (data.fullName) updateFields.fullName = data.fullName;
  if (data.dob || data.dateOfBirth) {
    updateFields.dob = data.dob || data.dateOfBirth;
    updateFields.dateOfBirth = data.dateOfBirth || data.dob;
  }
  if (data.about) updateFields.about = data.about;
  if (data.bio) updateFields.bio = data.bio;

  const updatedUser = await userModel.findByIdAndUpdate(userId, updateFields, { new: true });
  return updatedUser;
};

/**
 * Create Client / User in MongoDB upon profile setup (Step 4 of User Onboarding)
 */
const createUserOnProfileSetupService = async (reqUser, data, file) => {
  const email = (reqUser?.email || data?.email || '').toLowerCase().trim();
  if (!email) {
    throw new ApiError(status.BAD_REQUEST, "Email is required to create an account");
  }

  const existingUser = await getUserByEmail(email);
  if (existingUser) {
    throw new ApiError(status.CONFLICT, "An account with this email already exists");
  }

  const password = reqUser?.password || data?.password;
  if (!password) {
    throw new ApiError(status.BAD_REQUEST, "Password is required to create an account");
  }

  const userPayload = {
    email,
    password,
    role: 'user',
    fullName: data?.fullName || reqUser?.fullName || 'User',
    dob: data?.dob || data?.dateOfBirth || reqUser?.dob || '',
    dateOfBirth: data?.dateOfBirth || data?.dob || reqUser?.dateOfBirth || '',
    image: file ? file.filename : (data?.image || reqUser?.image || 'user.jpg'),
    status: 'active',
    isVerified: true,
    ...(data?.address !== undefined && { address: data.address }),
    ...(data?.number !== undefined && { number: data.number }),
    ...(data?.countryCode !== undefined && { countryCode: data.countryCode }),
    ...(data?.bio !== undefined && { bio: data.bio }),
    ...(data?.location !== undefined && { location: data.location }),
  };

  const newUser = await userModel.create(userPayload);
  return newUser;
};

/**
 * Create Instructor in MongoDB upon document submission (Step 5 of Instructor Onboarding)
 */
const createInstructorOnDocumentSubmissionService = async (reqUser, data = {}, files = {}) => {
  const email = (reqUser?.email || data?.email || '').toLowerCase().trim();
  if (!email) {
    throw new ApiError(status.BAD_REQUEST, "Email is required to create an instructor account");
  }

  const existingUser = await getUserByEmail(email);
  if (existingUser) {
    throw new ApiError(status.CONFLICT, "An account with this email already exists");
  }

  const password = reqUser?.password || data?.password;
  if (!password) {
    throw new ApiError(status.BAD_REQUEST, "Password is required to create an instructor account");
  }

  const instructorType = data?.instructorType || reqUser?.instructorType || 'certified';

  // 1. Profile Photo
  const profileImageFile = getUploadedFile(files, 'image', 'avatar', 'photo', 'profileImage');
  const profileImage = profileImageFile ? profileImageFile.filename : (reqUser?.image || data?.image || 'user.jpg');

  // 2. Swim Instruction Certification (Path A: Certified)
  const certFile = getUploadedFile(files, 'certificate', 'certificates', 'certification', 'certificateFile', 'certFile', 'cert');
  let certificationsList = [];
  let certifications = '';
  if (instructorType === 'certified' || certFile || data?.certificationName) {
    const certItem = {
      name: data?.certificationName || 'Water Safety Instructor Certification',
      issuer: data?.certificationIssuer || 'American Red Cross',
      expiryDate: data?.certificationExpiryDate || '',
      fileName: certFile?.filename || '',
      fileUrl: certFile ? `/uploads/users/${certFile.filename}` : ''
    };
    certificationsList = [certItem];
    certifications = certItem.name;
  }

  // 3. Additional Liability Waiver (Path B: Experience-Based)
  const isWaiverAgreed = data?.isWaiverAgreed === true || data?.isWaiverAgreed === 'true' || reqUser?.isWaiverAgreed === true;
  const experienceWaiver = {
    isAgreed: isWaiverAgreed,
    agreedAt: isWaiverAgreed ? new Date() : null
  };

  // 4. CPR / AED Certification
  const cprFile = getUploadedFile(files, 'cprCertificate', 'cprFile', 'cpr', 'cprCert', 'cprDoc');
  const cprCertification = {
    name: data?.cprName || 'CPR/AED Certification',
    issuer: data?.cprIssuer || '',
    expiryDate: data?.cprExpiryDate || '',
    fileName: cprFile ? cprFile.filename : '',
    fileUrl: cprFile ? `/uploads/users/${cprFile.filename}` : ''
  };

  // 5. First Aid Certification
  const firstAidFile = getUploadedFile(files, 'firstAidCertificate', 'firstAidFile', 'firstAid', 'firstaid', 'firstaidCert', 'firstAidDoc');
  const firstAidCertification = {
    name: data?.firstAidName || 'First Aid Certification',
    issuer: data?.firstAidIssuer || '',
    expiryDate: data?.firstAidExpiryDate || '',
    fileName: firstAidFile ? firstAidFile.filename : '',
    fileUrl: firstAidFile ? `/uploads/users/${firstAidFile.filename}` : ''
  };

  // 6. Background Check & ID
  const bgDoc = getUploadedFile(files, 'identityProof', 'backgroundDocument', 'document', 'identityDocument', 'idProof', 'idDocument', 'doc', 'idCard');
  const isConsent = data?.isConsentConfirmed === true || data?.isConsentConfirmed === 'true' || reqUser?.isConsentConfirmed === true;
  const backgroundCheck = {
    idType: data?.idType || 'Social Security Number',
    idNumber: data?.idNumber || '',
    documentName: bgDoc ? bgDoc.originalname : '',
    documentUrl: bgDoc ? `/uploads/users/${bgDoc.filename}` : '',
    issuer: data?.idIssuer || '',
    isConsentConfirmed: isConsent,
    submittedAt: new Date(),
    status: 'pending'
  };

  const instructorPayload = {
    email,
    password,
    role: 'instructor',
    fullName: data?.fullName || reqUser?.fullName || 'Instructor',
    dob: data?.dob || data?.dateOfBirth || reqUser?.dob || '',
    dateOfBirth: data?.dateOfBirth || data?.dob || reqUser?.dateOfBirth || '',
    about: data?.about || data?.bio || reqUser?.about || '',
    bio: data?.bio || data?.about || reqUser?.bio || '',
    image: profileImage,
    instructorType,
    certifications,
    certificationsList,
    experienceWaiver,
    cprCertification,
    firstAidCertification,
    backgroundCheck,
    status: 'pending',
    isVerified: false,
    ...(data?.experienceYears !== undefined && { experienceYears: Number(data.experienceYears) }),
    ...(data?.address !== undefined && { address: data.address }),
    ...(data?.number !== undefined && { number: data.number }),
    ...(data?.countryCode !== undefined && { countryCode: data.countryCode }),
    ...(data?.location !== undefined && { location: data.location }),
  };

  const newInstructor = await userModel.create(instructorPayload);
  return newInstructor;
};

const myDocumentsService = async (userId) => {
  const user = await userModel.findById(userId).select(
    'fullName email role status isVerified instructorType certifications certificationsList cprCertification firstAidCertification experienceWaiver backgroundCheck'
  );
  return user;
};

const profileByIdService = async (userId) => {
  const user = await userModel.findById(userId);
  return user;
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
        { role: { $regex: search, $options: "i" } },
      ],
    }
    : {};

  const banMatch = isBan !== undefined ? { isBan: isBan === "true" } : {};
  const roleMatch = role ? { role: { $in: role.split(",") } } : {};

  const matchQuery = {
    isDeleted: false,
    ...banMatch,
    ...roleMatch,
    ...searchMatch
  };

  const data = await userModel.find(matchQuery)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  const totalResults = await userModel.countDocuments(matchQuery);

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
  updateInstructorDocumentsService,
  createUserOnProfileSetupService,
  createInstructorOnDocumentSubmissionService,
  myDocumentsService,
  profileByIdService,
  allUserService,
  deleteAccountService,
  socialLoginWithAppleService,
  socialLoginWithGoogleService,
  changePasswordService
};
