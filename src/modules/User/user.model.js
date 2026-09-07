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
  avgRating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5,
  },
  totalReviews: {
    type: Number,
    default: 0,
    min: 0,
  },
  ratingCount: {
    type: Number,
    default: 0,
    min: 0,
  },
  bio: {
    type: String,
    default: '',
  },
  about: {
    type: String,
    default: '',
  },
  address: {
    type: String,
    default: '',
  },
  experienceYears: {
    type: Number,
    default: 0,
  },
  certifications: {
    type: String,
    default: 'Red Cross Water Safety Instructor · CPR/AED current · Background check cleared',
  },
  isVerified: {
    type: Boolean,
    default: true,
  },
  lessonsTaught: {
    type: Number,
    default: 0,
  },
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number],
      default: [0, 0] // [longitude, latitude]
    }
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