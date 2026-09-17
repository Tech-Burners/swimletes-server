const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  fullName: { type: String, required: false },
  email: { type: String, required: false, trim: true },
  number: { type: String, required: false },
  countryCode: { type: String, required: false },
  image: { type: String, required: false, default: 'user.jpg' },
  role: { type: String, enum: ['user', 'instructor', 'admin'], default: 'user' },
  status: { type: String, enum: ['active', 'suspended', 'banned', 'pending'], default: 'active' },
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
  instructorType: {
    type: String,
    enum: ['certified', 'experience_based'],
    default: 'certified'
  },
  certifications: {
    type: String,
    default: '',
  },
  certificationsList: [
    {
      name: { type: String },
      issuer: { type: String },
      expiryDate: { type: String },
      fileName: { type: String },
      fileUrl: { type: String }
    }
  ],
  cprCertification: {
    name: { type: String },
    issuer: { type: String },
    expiryDate: { type: String },
    fileName: { type: String },
    fileUrl: { type: String }
  },
  firstAidCertification: {
    name: { type: String },
    issuer: { type: String },
    expiryDate: { type: String },
    fileName: { type: String },
    fileUrl: { type: String }
  },
  backgroundCheck: {
    idType: { type: String },
    idNumber: { type: String },
    documentName: { type: String },
    documentUrl: { type: String },
    issuer: { type: String },
    isConsentConfirmed: { type: Boolean },
    status: { type: String, enum: ['pending', 'cleared', 'rejected'] }
  },
  isVerified: {
    type: Boolean,
    default: true,
  },
  lessonsTaught: {
    type: Number,
    default: 0,
  },
  totalEarnings: {
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