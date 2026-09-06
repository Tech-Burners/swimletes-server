const jwt = require('jsonwebtoken');
const catchAsync = require('../helpers/catchAsync');
const { status } = require("http-status");
const ApiError = require('../helpers/ApiError');
const { getUserById } = require('../modules/Auth/auth.service');
const jwksClient = require("jwks-rsa");

const appleClient = jwksClient({
  jwksUri: "https://appleid.apple.com/auth/keys",
});

const getAppleSigningKey = async (kid) => {
  const key = await appleClient.getSigningKey(kid);
  return key.getPublicKey();
};

const verifyAppleToken = async (idToken) => {
  try {
    const decodedHeader = jwt.decode(idToken, {
      complete: true,
    });

    if (!decodedHeader || !decodedHeader.header?.kid) {
      throw new Error("Invalid token header");
    }

    const publicKey = await getAppleSigningKey(
      decodedHeader.header.kid
    );

    const payload = jwt.verify(idToken, publicKey, {
      algorithms: ["RS256"],
      issuer: "https://appleid.apple.com",
      // audience: process.env.APPLE_CLIENT_ID,
    });

    return {
      appleId: payload.sub,
      email: payload.email ?? null,
      emailVerified: payload.email_verified,
      name: payload.name || "New User",
    };
  } catch (err) {
    throw new ApiError(
      status.FORBIDDEN,
      "Invalid Apple ID token"
    );
  }
};




const auth = (userRoles, { optional = false } = {}) => {
  return catchAsync(async (req, res, next) => {
    const { authorization } = req.headers;

    // No token case
    if (!authorization || !authorization.startsWith("Bearer ")) {
      if (optional) {
        req.User = null;
        return next();
      }
      throw new ApiError(status.UNAUTHORIZED, "Unauthorized");
    }

    const token = authorization.split(" ")[1];

    let decodedData;

    try {
      decodedData = jwt.verify(token, process.env.JWT_ACCESS_TOKEN);
    } catch (err) {
      if (optional) {
        req.User = null;
        return next();
      }
      throw new ApiError(status.UNAUTHORIZED, "Invalid or expired token");
    }

    const user = await getUserById(decodedData._id);
    if (!user) throw new ApiError(status.NOT_FOUND, "Unauthorized User");

    if (userRoles && !userRoles.includes(decodedData.role)) {
      throw new ApiError(status.UNAUTHORIZED, "You are not authorized");
    }
    
    if (decodedData.tokenVersion !== user.tokenVersion) {
      // console.log("kkkkk", decodedData.tokenVersion, user.tokenVersion );
      throw new ApiError(
        status.UNAUTHORIZED,
        "Session expired. Please login again."
      );
    }

    if (decodedData.isLoginToken === false) {
      throw new ApiError(status.FORBIDDEN, "You are not authorized");
    }

    req.User = decodedData;
    next();
  });
};


const resetTokenCheck = (req, res, next) => {

  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer "))
    return res.status(401).json({ message: "Unauthorized" });

  try {
    const token = authHeader.split(" ")[1];

    const decoded = jwt.verify(
      token,
      process.env.JWT_ACCESS_TOKEN
    );

    if (decoded.purpose !== "reset-password")
      throw new Error();

    req.ResetUser = decoded;

    next();

  } catch {
    throw new ApiError(status.UNAUTHORIZED, 'Invalid or expired token');
  }
};



const tokenCheck = catchAsync(async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1];

    if (token && token !== "null") {
      try {
        req.User = jwt.verify(token, process.env.JWT_ACCESS_TOKEN);
      } catch (error) {
        req.User = null;
      }
    }
  }
  next();
});



const requirePermission = catchAsync((permission) => {
  return async (req, res, next) => {
    const admin = await adminModel.findOne({ user: req.User._id });
    if (!admin || !admin.categoryPermissions.includes(permission)) {
      return res.status(403).json({ message: 'Permission denied, you are not authorized for that' });
    }
    next();
  };
});



module.exports = { auth, tokenCheck, requirePermission, resetTokenCheck, verifyAppleToken };