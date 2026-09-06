const { OAuth2Client } = require("google-auth-library");
const httpStatus = require("http-status");
const ApiError = require("../helpers/ApiError");

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const verifyGoogleToken = async (idToken) => {
  try {
    console.log()
    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();

    if (!payload || !payload.email) {
      throw new ApiError(
        httpStatus.FORBIDDEN,
        "Invalid Google ID token"
      );
    }

    if (!payload.email_verified) {
      throw new ApiError(
        httpStatus.FORBIDDEN,
        "Google email is not verified"
      );
    }

    return {
      googleId: payload.sub,
      email: payload.email,
      name: payload.name,
      image: payload.picture,
      emailVerified: payload.email_verified,
    };
  } catch (error) {
    console.error("Google token verification failed:", error);

    throw new ApiError(
      httpStatus.FORBIDDEN,
      "Invalid Google ID token"
    );
  }
};

module.exports = {
  verifyGoogleToken,
};