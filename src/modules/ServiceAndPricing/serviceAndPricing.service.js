const ServiceAndPricing = require('./serviceAndPricing.model');
const ApiError = require('../../helpers/ApiError');
const httpStatus = require('http-status');

const createOrUpdateServiceAndPricing = async (instructorId, payload) => {
  let serviceAndPricing = await ServiceAndPricing.findOne({ instructor: instructorId });

  if (!serviceAndPricing) {
    serviceAndPricing = new ServiceAndPricing({
      instructor: instructorId,
      ...payload
    });
  } else {
    // Update fields
    if (payload.durations !== undefined) serviceAndPricing.durations = payload.durations;
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

const getInstructorServiceAndPricing = async (instructorId) => {
  const serviceAndPricing = await ServiceAndPricing.findOne({ instructor: instructorId })
    .populate('instructor', 'fullName email image');

  if (!serviceAndPricing) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Service and pricing not found for this instructor');
  }
  return serviceAndPricing;
};

module.exports = {
  createOrUpdateServiceAndPricing,
  getMyServiceAndPricing,
  getInstructorServiceAndPricing
};
