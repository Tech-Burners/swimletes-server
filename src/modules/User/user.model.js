const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  fullName: { type: String, required: false },
  email: { type: String, required: false, trim: true },
  number: { type: String, required: false },
  countryCode: { type: String, required: false },
  image: {
    type: String,
    required: false,
    default: '/uploads/users/user.jpg',
    set: function (val) {
      if (!val || typeof val !== 'string') return val;
      const trimmed = val.trim();
      if (!trimmed) return trimmed;
      if (trimmed.startsWith('/') || trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        return trimmed;
      }
      return `/uploads/users/${trimmed}`;
    },
    get: function (val) {
      if (!val || typeof val !== 'string') return val;
      const trimmed = val.trim();
      if (!trimmed) return trimmed;
      if (trimmed.startsWith('/') || trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        return trimmed;
      }
      return `/uploads/users/${trimmed}`;
    }
  },
  role: { type: String, enum: ['user', 'instructor', 'admin'], default: 'user' },
  status: { type: String, enum: ['active', 'suspended', 'banned', 'pending', 'rejected'], default: 'active' },
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
  teaches: {
    type: [String],
    default: ['Kids 5-12', 'Teens', 'Adult']
  },
  speaks: {
    type: [String],
    default: ['English', 'Spanish']
  },
  experience: {
    years: {
      type: Number,
      default: 0,
    },
    description: {
      type: String,
      default: '',
    },
    referenceName: {
      type: String,
      default: '',
    },
    referenceContact: {
      type: String,
      default: '',
    },
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
  certification: {
    name: { type: String, default: '' },
    issuer: { type: String, default: '' },
    expiryDate: { type: String, default: '' },
    fileName: { type: String, default: '' },
    fileUrl: { type: String, default: '' }
  },
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
  statusReason: {
    type: String,
    default: '',
  },
  statusUpdatedAt: {
    type: Date
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
  bankAccount: {
    bankName: { type: String, default: '' },
    accountHolderName: { type: String, default: '' },
    routingNumber: { type: String, default: '' },
    accountNumber: { type: String, default: '' },
    accountLast4: { type: String, default: '' },
    maskedAccountNumber: { type: String, default: '' },
    isConfigured: { type: Boolean, default: false },
    updatedAt: { type: Date }
  },
},
  {
    timestamps: true,
    toJSON: { getters: true, virtuals: true },
    toObject: { getters: true, virtuals: true }
  }
);

userSchema.virtual('isBan').get(function () {
  return this.status === 'banned' || this.status === 'suspended';
});

userSchema.pre("save", async function (next) {
  if (this.isModified("password") && this.password) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  next();
});

userSchema.index({ location: "2dsphere" });

module.exports = mongoose.model('User', userSchema);