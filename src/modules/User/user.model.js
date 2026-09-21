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
  dob: { type: String, default: '' },
  dateOfBirth: { type: String, default: '' },
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
      name: { type: String, default: '' },
      issuer: { type: String, default: '' },
      expiryDate: { type: String, default: '' },
      fileName: { type: String, default: '' },
      fileUrl: { type: String, default: '' }
    }
  ],
  cprCertification: {
    name: { type: String, default: 'CPR/AED Certification' },
    issuer: { type: String, default: '' },
    expiryDate: { type: String, default: '' },
    fileName: { type: String, default: '' },
    fileUrl: { type: String, default: '' }
  },
  firstAidCertification: {
    name: { type: String, default: 'First Aid Certification' },
    issuer: { type: String, default: '' },
    expiryDate: { type: String, default: '' },
    fileName: { type: String, default: '' },
    fileUrl: { type: String, default: '' }
  },
  experienceWaiver: {
    isAgreed: { type: Boolean, default: false },
    agreedAt: { type: Date }
  },
  backgroundCheck: {
    idType: { type: String, default: '' },
    idNumber: { type: String, default: '' },
    documentName: { type: String, default: '' },
    documentUrl: { type: String, default: '' },
    issuer: { type: String, default: '' },
    isConsentConfirmed: { type: Boolean, default: false },
    submittedAt: { type: Date },
    status: { type: String, enum: ['pending', 'cleared', 'rejected', 'not_submitted'], default: 'not_submitted' }
  },
  isVerified: {
    type: Boolean,
    default: false,
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