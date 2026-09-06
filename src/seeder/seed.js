const User = require("../modules/User/user.model");


const seedAdmin = async () => {
  try {
    await User.create({
      fullName: "Admin",
      email: process.env.ADMIN_EMAIL,
      password: process.env.ADMIN_PASSWORD,
      role: "admin",
      isVerified: true
    });

    console.log("✅ Super Admin created successfully.");
  } catch (error) {
    console.error("❌ Error creating admin user:", error);
  }
};


module.exports = {
  seedAdmin
}

