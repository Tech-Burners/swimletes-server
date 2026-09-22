const jwt = require('jsonwebtoken');

const tokenGenerator = async (user) => {

  const payload = {
    _id: user._id,
    fullName: user.fullName,
    email: user.email,
    number: user.number,
    countryCode: user.countryCode,
    image: user.image, role: user.role,
    // isLoginToken: user.isLoginToken ? user.isLoginToken : false
    tokenVersion: user.tokenVersion
  }
  // console.log("payload", payload);
  return await jwt.sign(payload, process.env.JWT_ACCESS_TOKEN, {
    expiresIn: '1y',
  });
}




const resetTokenGenerator = (user) => {
  return jwt.sign(
    {
      _id: user._id,
      email: user.email,
      role: user.role,
      fullName: user.fullName,
      purpose: "reset-password"
    },
    process.env.JWT_ACCESS_TOKEN,
    {
      expiresIn: "15m"
    }
  );
};



module.exports = { tokenGenerator, resetTokenGenerator };