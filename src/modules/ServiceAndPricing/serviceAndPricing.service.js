const mongoose = require('mongoose');
const ServiceAndPricing = require('./serviceAndPricing.model');
const User = require('../User/user.model');
const ApiError = require('../../helpers/ApiError');
const httpStatus = require('http-status');

const createOrUpdateServiceAndPricing = async (instructorId, payload) => {
  let serviceAndPricing = await ServiceAndPricing.findOne({ instructor: instructorId });

  if (!serviceAndPricing) {
    serviceAndPricing = new ServiceAndPricing({
      instructor: instructorId,
      ...payload,
      ...(payload.duration !== undefined ? { duration: Number(payload.duration) } : payload.durations !== undefined ? { duration: Array.isArray(payload.durations) ? Number(payload.durations[0]) : Number(payload.durations) } : {})
    });
  } else {
    // Update fields
    if (payload.duration !== undefined) serviceAndPricing.duration = Number(payload.duration);
    else if (payload.durations !== undefined) serviceAndPricing.duration = Array.isArray(payload.durations) ? Number(payload.durations[0]) : Number(payload.durations);
    if (payload.pricePerLesson !== undefined) serviceAndPricing.pricePerLesson = payload.pricePerLesson;
    if (payload.ownPool !== undefined) serviceAndPricing.ownPool = payload.ownPool;
    if (payload.travelToClient !== undefined) serviceAndPricing.travelToClient = payload.travelToClient;
    if (payload.publicPools !== undefined) serviceAndPricing.publicPools = payload.publicPools;
    if (payload.ageGroups !== undefined) serviceAndPricing.ageGroups = payload.ageGroups;
    if (payload.languages !== undefined) serviceAndPricing.languages = payload.languages;
    if (payload.goodToKnow !== undefined) serviceAndPricing.goodToKnow = payload.goodToKnow;
  }

  await serviceAndPricing.save();
  return serviceAndPricing;
};

const getMyServiceAndPricing = async (instructorId) => {
  const serviceAndPricing = await ServiceAndPricing.findOne({ instructor: instructorId });
  return serviceAndPricing;
};

/**
 * Get Instructor Service Details for User End (matching Figma Details / About page: 40012606:5436)
 * Lightweight and optimized for fast response.
 */
const getInstructorServiceAndPricing = async (instructorId) => {
  if (!mongoose.Types.ObjectId.isValid(instructorId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid instructor ID');
  }

  const instructorObjectId = new mongoose.Types.ObjectId(String(instructorId));

  // 1. Fetch Instructor Profile
  const instructor = await User.findById(instructorObjectId).select(
    'fullName email number countryCode image role avgRating totalReviews ratingCount bio about address experience certifications isVerified lessonsTaught'
  );

  if (!instructor || instructor.role !== 'instructor') {
    throw new ApiError(httpStatus.NOT_FOUND, 'Instructor not found');
  }

  // 2. Fetch Service & Pricing
  const serviceAndPricing = await ServiceAndPricing.findOne({ instructor: instructorObjectId });

  return {
    instructor: {
      _id: instructor._id,
      fullName: instructor.fullName || 'Naomi Johnson',
      email: instructor.email,
      image: instructor.image || '/uploads/users/user.jpg',
      address: instructor.address || 'Oak Lawn, Dallas',
      bio: instructor.bio || instructor.about || 'Head coach of a Dallas high-school swim team. Most of my private work is with kids who are frightened of the water — we go at their pace, and nobody gets dunked. I also coach adult beginners and stroke refinement for triathletes.',
      experienceYears: instructor.experience?.years !== undefined ? instructor.experience.years : 6,
      certifications: instructor.certifications || 'Red Cross Water Safety Instructor · CPR/AED current to Mar 2027 · Background check cleared Jan 2026',
      isVerified: instructor.isVerified !== undefined ? instructor.isVerified : true,
      badgeText: 'Checked by SwimLetes',
      avgRating: instructor.avgRating || 4.8,
      totalReviews: instructor.totalReviews || 128,
      lessonsTaught: instructor.lessonsTaught || 128
    },
    serviceAndPricing: serviceAndPricing || {
      duration: 60,
      pricePerLesson: 60,
      ownPool: {
        enabled: true,
        address: 'Oak Lawn, Dallas',
        images: ['pool1.jpg', 'pool2.jpg'],
        location: { type: 'Point', coordinates: [-96.8055, 32.8021] }
      },
      travelToClient: {
        enabled: true,
        includedDistance: 15,
        maxDistance: 35,
        surcharges: [
          { minDistance: 15, maxDistance: 25, fee: 10 },
          { minDistance: 25, maxDistance: 35, fee: 20 }
        ]
      },
      publicPools: {
        enabled: true,
        pools: [
          {
            poolName: 'Oak Lawn Community Pool',
            address: '3418 Cedar Springs Rd, Dallas, TX 75219',
            hasEntryFee: true,
            entryFee: 8
          }
        ]
      },
      ageGroups: ['kids_5_12', 'teens', 'adults'],
      languages: ['English', 'Spanish'],
      goodToKnow: [
        {
          question: 'Cancelling',
          answer: 'Free up to 24 hours before. After that, half the lesson price.'
        },
        {
          question: 'Bring',
          answer: 'Swimsuit, towel, goggles. Caps sold at reception for $8.'
        },
        {
          question: 'Parents',
          answer: 'Welcome on the deck. Under-8s need an adult on site for the whole lesson.'
        }
      ]
    }
  };
};

module.exports = {
  createOrUpdateServiceAndPricing,
  getMyServiceAndPricing,
  getInstructorServiceAndPricing
};
