const OTP = require("./otp.model");
const crypto = require("crypto");
const { emailWithNodemailer } = require("../../helpers/email");
const ApiError = require("../../helpers/ApiError");
const httpStatus = require("http-status");

const normalizeSentTo = (sentTo, receiverType) => {
  if (!sentTo) return sentTo;

  sentTo = String(sentTo).trim();

  if (receiverType === "phone") {
    // Always store phone as +8801712345678
    return sentTo.startsWith("+") ? sentTo : `+${sentTo}`;
  }

  if (receiverType === "email") {
    return sentTo.toLowerCase();
  }

  return sentTo;
};


const sendOTP = async (
  name,
  sentTo,
  receiverType,
  purpose = "email-verification"
) => {
  sentTo = normalizeSentTo(sentTo, receiverType);

  console.log({
    name,
    sentTo,
    receiverType,
    purpose,
  });

  // const otp = Math.floor(100000 + Math.random() * 900000);
  const crypto = require("crypto");

  const otp = crypto.randomInt(100000, 1000000);

  const otpExpiryTime =
    parseInt(process.env.OTP_EXPIRY_TIME) || 3;

  const expiredAt = new Date(
    Date.now() + otpExpiryTime * 60 * 1000
  );

  // ==========================================
  // 1. SEND OTP FIRST
  // ==========================================

  if (receiverType === "email") {
    const subject =
      purpose === "email-verification"
        ? "Email verification code"
        : "Forgot password code";

    await emailWithNodemailer({
      email: sentTo,
      subject,
       html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Verification Code</title>
      </head>

      <body style="
        margin: 0;
        padding: 0;
        background-color: #f4f6f8;
        font-family: Arial, Helvetica, sans-serif;
      ">

        <table width="100%" cellpadding="0" cellspacing="0" border="0"
          style="background-color: #f4f6f8; padding: 40px 15px;">

          <tr>
            <td align="center">

              <table width="100%" cellpadding="0" cellspacing="0" border="0"
                style="
                  max-width: 500px;
                  background: #ffffff;
                  border-radius: 10px;
                  overflow: hidden;
                ">

                <!-- Header -->
                <tr>
                  <td align="center"
                    style="
                      padding: 25px;
                      background-color: #111827;
                    ">

                    <h1 style="
                      margin: 0;
                      color: #ffffff;
                      font-size: 22px;
                      font-weight: 600;
                    ">
                      ${process.env.appName}
                    </h1>

                  </td>
                </tr>

                <!-- Content -->
                <tr>
                  <td style="padding: 40px 35px;">

                    <h2 style="
                      margin: 0 0 15px;
                      color: #111827;
                      font-size: 22px;
                    ">
                      Verification Code
                    </h2>

                    <p style="
                      margin: 0 0 25px;
                      color: #6b7280;
                      font-size: 15px;
                      line-height: 1.6;
                    ">
                      Use the verification code below to complete your
                      verification.
                    </p>

                    <!-- OTP -->
                    <div style="
                      padding: 18px;
                      background-color: #f3f4f6;
                      border: 1px solid #e5e7eb;
                      border-radius: 8px;
                      text-align: center;
                    ">

                      <span style="
                        font-size: 32px;
                        font-weight: 700;
                        letter-spacing: 8px;
                        color: #111827;
                      ">
                        ${otp}
                      </span>

                    </div>

                    <p style="
                      margin: 20px 0 0;
                      text-align: center;
                      color: #6b7280;
                      font-size: 14px;
                    ">
                      This code will expire in
                      <strong>${otpExpiryTime} minutes</strong>.
                    </p>

                    <p style="
                      margin: 30px 0 0;
                      color: #9ca3af;
                      font-size: 13px;
                      line-height: 1.6;
                    ">
                      If you didn't request this code, you can safely
                      ignore this email. Never share your verification
                      code with anyone.
                    </p>

                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td align="center"
                    style="
                      padding: 20px;
                      background-color: #f9fafb;
                      border-top: 1px solid #e5e7eb;
                    ">

                    <p style="
                      margin: 0;
                      color: #9ca3af;
                      font-size: 12px;
                    ">
                      This is an automated message. Please do not reply.
                    </p>

                  </td>
                </tr>

              </table>

            </td>
          </tr>

        </table>

      </body>
      </html>
    `,
    });
  }

  // if (receiverType === "phone") {
  //   await sendSMSOtp(sentTo, otp);
  // }

  // if (receiverType === "phone") {
  //   await sendWhatsAppOtp(sentTo, otp);
  // }
  // ==========================================
  // 2. ONLY SAVE OTP IF SENDING SUCCESSFUL
  // ==========================================

  await OTP.findOneAndUpdate(
    {
      sentTo,
      receiverType,
      purpose,
      status: "pending",
    },
    {
      otp,
      expiredAt,
      status: "pending",
      verifiedAt: null,
    },
    {
      upsert: true,
      new: true,
    }
  );

  return {
    success: true,
    message:
      receiverType === "email"
        ? "OTP sent to your email"
        : "OTP sent to your phone",
  };
};


const checkOTPService = async (sentTo, receiverType) => {
  sentTo = normalizeSentTo(sentTo, receiverType);

  return await OTP.findOne({
    sentTo,
    receiverType,
    status: "pending",
    expiredAt: { $gt: new Date() },
  });
};

const verifyOTP = async (
  sentTo,
  receiverType,
  purpose,
  otp
) => {
  sentTo = normalizeSentTo(sentTo, receiverType);

  const otpData = await OTP.findOne({
    sentTo,
    receiverType,
    purpose,
    otp,
    status: "pending",
    expiredAt: { $gt: new Date() },
  });

  if (!otpData) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Invalid or expired OTP"
    );
  }

  otpData.status = "expired";
  otpData.verifiedAt = new Date();

  await otpData.save();

  return otpData;
};

const checkOTPValidity = async (
  sentTo,
  receiverType
) => {
  sentTo = normalizeSentTo(sentTo, receiverType);

  return await OTP.findOne({
    sentTo,
    receiverType,
    status: "verified",
    expiredAt: { $gt: new Date() },
  });
};

const updateOTP = async (otpId, otpBody) => {
  const otpData = await OTP.findById(otpId);

  if (!otpData) {
    return false;
  }

  Object.assign(otpData, otpBody);

  await otpData.save();

  return true;
};

const deleteOTP = async (otpId) => {
  return await OTP.findByIdAndDelete(otpId);
};

module.exports = {
  sendOTP,
  checkOTPService,
  verifyOTP,
  checkOTPValidity,
  updateOTP,
  deleteOTP,
};






// const OTP = require('./otp.model');
// const { emailWithNodemailer } = require('../../helpers/email');
// const ApiError = require('../../helpers/ApiError');
// const httpStatus = require('http-status');
// const { sendSMSOtp } = require('../../helpers/sms');


// const sendOTP = async (name, sentTo, receiverType, purpose = 'email-verification') => {
//   console.log({ name, sentTo, receiverType, purpose });

//   const otp = Math.floor(100000 + Math.random() * 900000);

//   const otpExpiryTime = parseInt(process.env.OTP_EXPIRY_TIME) || 3;
//   const expiredAt = new Date(Date.now() + otpExpiryTime * 60 * 1000);

//   await OTP.findOneAndUpdate(
//     { sentTo, receiverType, purpose, status: 'pending' },
//     { otp, expiredAt, status: 'pending', verifiedAt: null },
//     { upsert: true, new: true }
//   );

//   // EMAIL
//   if (receiverType === 'email') {
//     const subject = purpose === 'email-verification'
//       ? 'Email verification code'
//       : 'Forgot password code';

//     const emailData = {
//       email: sentTo,
//       subject,
//       html: `Your OTP is <b>${otp}</b>. It will expire in ${otpExpiryTime} minutes.`,
//     };

//     emailWithNodemailer(emailData).catch(console.error);
//   }

//   //SMS
//   if (receiverType === 'phone') {
//     console.log({ sentTo, otp });
//     await sendSMSOtp(sentTo, otp);
//   }

//   return true;
// };


// const checkOTPService = async (sentTo, receiverType) => {
//   return await OTP.findOne({ sentTo: sentTo, status: 'pending', receiverType: receiverType, expiredAt: { $gt: new Date() } })
// }

// const normalizeSentTo = (sentTo, receiverType) => {
//   if (!sentTo) return sentTo;

//   sentTo = String(sentTo).trim();

//   if (receiverType === 'phone') {
//     // normalize phone
//     if (!sentTo.startsWith('+')) {
//       return `+${sentTo}`;
//     }
//     return sentTo;
//   }

//   if (receiverType === 'email') {
//     // normalize email
//     return sentTo.toLowerCase(); // important
//   }

//   return sentTo;
// };


// const verifyOTP = async (sentTo, receiverType, purpose, otp) => {
//   console.log({ sentTo, receiverType, purpose, otp });
//   sentTo = normalizeSentTo(sentTo, receiverType);

//   console.log({ sentTo, receiverType, purpose, otp });

//   const otpData = await OTP.findOne({
//     sentTo,
//     receiverType,
//     purpose,
//     otp,
//     expiredAt: { $gt: new Date() },
//     status: "pending",
//   });

//   console.log({ otpData });

//   if (!otpData) {
//     throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid or expired OTP');
//   }

//   otpData.status = 'expired';
//   otpData.verifiedAt = new Date();
//   await otpData.save();
//   return otpData;
// };


// const checkOTPValidity = (sentTo) => {
//   return OTP.findOne({ sentTo: sentTo, expiredAt: { $gt: new Date() }, status: 'verified' })
// }

// const updateOTP = async (otpId, otpBody) => {
//   const otpData = await OTP.findById(otpId);
//   if (!otpData) {
//     return false;
//   }
//   Object.assign(otpData, otpBody);
//   await otpData.save();
//   return true;
// }

// const deleteOTP = async (otpId) => {
//   return await OTP.findByIdAndDelete(otpId);
// }

// module.exports = {
//   sendOTP,
//   checkOTPService,
//   verifyOTP,
//   checkOTPValidity,
//   updateOTP,
//   deleteOTP
// }