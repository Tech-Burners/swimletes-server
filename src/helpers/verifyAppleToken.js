// const ApiError = require("./ApiError");
// const firebaseAdmin = require("./firebaseAdmin");
// const httpStatus = require("http-status");

// const verifyAppleToken = async (idToken) => {
//   try {
//     const decodedToken = await firebaseAdmin.verifyIdToken(idToken);

//     console.log("Apple decoded token:");
//     console.dir(decodedToken, {
//       depth: null,
//       colors: true,
//     });

//     const appleId =
//       decodedToken?.firebase?.identities?.["apple.com"]?.[0];

//     if (!appleId) {
//       throw new Error("Apple identity not found in Firebase token");
//     }

//     const data = {
//       appleId,
//       firebaseUid: decodedToken.uid,
//       email: decodedToken.email,
//       name: decodedToken.name || "",
//       picture: decodedToken.picture || "",
//       emailVerified: decodedToken.email_verified,
//     };

//     console.log("Apple data:", data);

//     return data;
//   } catch (error) {
//     console.log("Apple token verification error:", error);

//     throw new ApiError(
//       httpStatus.FORBIDDEN,
//       "Invalid Apple ID token"
//     );
//   }
// };



// const verifyGoogleToken = async (idToken) => {
//   try {
//     console.log("Google ID token:", idToken);
//     const decodedToken = await firebaseAdmin.verifyIdToken(idToken);
//     return {
//       googleId: decodedToken.sub,
//       email: decodedToken.email,
//       name: decodedToken.name || "",
//       picture: decodedToken.picture || "",
//       emailVerified: decodedToken.email_verified,
//     };

//   } catch (error) {
//     console.log("Google token verification error:", error);

//     throw new ApiError(
//       httpStatus.FORBIDDEN,
//       "Invalid Google ID token"
//     );
//   }
// };

// module.exports = {
//   verifyAppleToken,
//   verifyGoogleToken,
// };