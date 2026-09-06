const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  fullName: { type: String, required: false },
  email: { type: String, required: false, trim: true },
  number: { type: String, required: false },
  countryCode: { type: String, required: false },
  image: { type: String, required: false, default: 'user.jpg' },
  role: { type: String, enum: ['user', 'instructor', 'admin'], default: 'user' },
  isBan: { type: Boolean, default: false },
  isDeleted: { type: Boolean, default: false },
  password: { type: String, required: false },
  googleId: { type: String },
  appleId: { type: String },
  loginWith: {
    type: String,
    enum: ["local", "google", "apple"],
    default: "local",
  },
},
  {
    timestamps: true
  }
);

userSchema.pre("save", async function (next) {
  if (this.isModified("password") && this.password) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  next();
});

userSchema.index({ location: "2dsphere" });

module.exports = mongoose.model('User', userSchema);