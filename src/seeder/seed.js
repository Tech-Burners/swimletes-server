const User = require("../modules/User/user.model");

const seedAdmin = async () => {
  try {
    const existingAdmin = await User.findOne({
      email: process.env.ADMIN_EMAIL
    });

    if (existingAdmin) {
      console.log("ℹ️ Admin user already exists. Skipping creation.");
      return;
    }

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
};



