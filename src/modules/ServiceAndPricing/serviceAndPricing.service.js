const mongoose = require('mongoose');
const ServiceAndPricing = require('./serviceAndPricing.model');
const User = require('../User/user.model');
const Favourite = require('../Favourite/favourite.model');
const ApiError = require('../../helpers/ApiError');
const { status: httpStatus } = require('http-status');

// Helper to normalize public pool inputs (Figma: Add pool modal 40012599:4787)
const normalizePool = (pool) => {
  if (!pool || typeof pool !== 'object') return null;
  const poolName = (pool.poolName || pool.name || '').trim();
  if (!poolName) return null;
  const address = (pool.address || (typeof pool.location === 'string' ? pool.location : '') || '').trim();
  const rawFee = pool.entryFee !== undefined ? Number(String(pool.entryFee).replace(/[^0-9.]/g, '')) : 0;
  const entryFee = isNaN(rawFee) ? 0 : rawFee;
  const hasEntryFee = pool.hasEntryFee !== undefined
    ? (typeof pool.hasEntryFee === 'string' ? pool.hasEntryFee === 'true' : Boolean(pool.hasEntryFee))
    : entryFee > 0;

  const res = {
    poolName,
    address,
    location: typeof pool.location === 'object' && pool.location !== null
      ? pool.location
      : (address || { type: 'Point', coordinates: [0, 0] }),
    hasEntryFee,
    entryFee: hasEntryFee ? entryFee : 0
  };
  if (pool._id) {
    res._id = pool._id;
  }
  return res;
};

const createOrUpdateServiceAndPricing = async (instructorId, payload = {}, files = null) => {
  let serviceAndPricing = await ServiceAndPricing.findOne({ instructor: instructorId });

  // 1. Process uploaded files (files can be array from req.files or object from req.file)
  const uploadedFilePaths = [];
  if (files) {
    if (Array.isArray(files)) {
      files.forEach((f) => {
        if (f?.filename) {
          uploadedFilePaths.push(`/uploads/services/${f.filename}`);
        }
      });
    } else if (files.filename) {
      uploadedFilePaths.push(`/uploads/services/${files.filename}`);
    } else if (typeof files === 'object') {
      Object.values(files).forEach((val) => {
        if (Array.isArray(val)) {
          val.forEach((f) => {
            if (f?.filename) uploadedFilePaths.push(`/uploads/services/${f.filename}`);
          });
        } else if (val?.filename) {
          uploadedFilePaths.push(`/uploads/services/${val.filename}`);
        }
      });
    }
  }

  // 2. Also process any images passed in payload/body
  const payloadImages = [];
  const multiImgs = payload.images || (payload.image ? [payload.image] : null);
  if (Array.isArray(multiImgs)) {
    multiImgs.forEach((img) => {
      if (typeof img === 'string' && img.trim()) {
        const trimmed = img.trim();
        payloadImages.push(
          trimmed.startsWith('/') || trimmed.startsWith('http://') || trimmed.startsWith('https://')
            ? trimmed
            : `/uploads/services/${trimmed}`
        );
      }
    });
  } else if (typeof multiImgs === 'string' && multiImgs.trim()) {
    const trimmed = multiImgs.trim();
    payloadImages.push(
      trimmed.startsWith('/') || trimmed.startsWith('http://') || trimmed.startsWith('https://')
        ? trimmed
        : `/uploads/services/${trimmed}`
    );
  }

  const allNewImages = [...uploadedFilePaths, ...payloadImages];

  // 3. Parse nested fields if passed as JSON strings
  ['ownPool', 'publicPools', 'travelToClient', 'ageGroups', 'languages', 'goodToKnow'].forEach((key) => {
    if (typeof payload[key] === 'string') {
      try {
        payload[key] = JSON.parse(payload[key]);
      } catch (e) {}
    }
  });

  // 4. Handle ownPool structure and pool images
  let ownPoolPayload = payload.ownPool;
  if (typeof ownPoolPayload === 'object' && ownPoolPayload !== null) {
    if (Array.isArray(ownPoolPayload.images)) {
      ownPoolPayload.images = ownPoolPayload.images.map((img) => {
        if (typeof img === 'string' && img.trim()) {
          const trimmed = img.trim();
          return trimmed.startsWith('/') || trimmed.startsWith('http://') || trimmed.startsWith('https://')
            ? trimmed
            : `/uploads/services/${trimmed}`;
        }
        return img;
      });
    }

    if (allNewImages.length > 0) {
      const existing = Array.isArray(ownPoolPayload.images) ? ownPoolPayload.images : [];
      ownPoolPayload.images = Array.from(new Set([...existing, ...allNewImages]));
    }
  }

  // 5. Handle publicPools normalization
  if (payload.publicPools !== undefined) {
    let publicPoolsData = payload.publicPools;
    if (typeof publicPoolsData === 'string') {
      try {
        publicPoolsData = JSON.parse(publicPoolsData);
      } catch (e) {}
    }
    if (publicPoolsData && typeof publicPoolsData === 'object') {
      const enabled = publicPoolsData.enabled !== undefined
        ? (typeof publicPoolsData.enabled === 'string' ? publicPoolsData.enabled === 'true' : Boolean(publicPoolsData.enabled))
        : true;
      let pools = [];
      if (Array.isArray(publicPoolsData.pools)) {
        pools = publicPoolsData.pools.map(normalizePool).filter(Boolean);
      }
      payload.publicPools = {
        enabled,
        pools
      };
    }
  } else if (payload.pools !== undefined && Array.isArray(payload.pools)) {
    payload.publicPools = {
      enabled: true,
      pools: payload.pools.map(normalizePool).filter(Boolean)
    };
  }

  // Remove root images from payload so images only save into ownPool.images
  delete payload.images;
  delete payload.image;

  if (!serviceAndPricing) {
    const defaultOwnPool = ownPoolPayload || {
      enabled: false,
      address: '',
      images: allNewImages,
      location: { type: 'Point', coordinates: [0, 0] }
    };

    if (allNewImages.length > 0 && !defaultOwnPool.images?.length) {
      defaultOwnPool.images = allNewImages;
    }

    serviceAndPricing = new ServiceAndPricing({
      instructor: instructorId,
      ...payload,
      ownPool: defaultOwnPool,
      ...(payload.duration !== undefined
        ? { duration: Number(payload.duration) }
        : payload.durations !== undefined
        ? { duration: Array.isArray(payload.durations) ? Number(payload.durations[0]) : Number(payload.durations) }
        : {}),
      ...(payload.pricePerLesson !== undefined ? { pricePerLesson: Number(payload.pricePerLesson) } : {})
    });
  } else {
    // Update fields
    if (payload.duration !== undefined) serviceAndPricing.duration = Number(payload.duration);
    else if (payload.durations !== undefined) {
      serviceAndPricing.duration = Array.isArray(payload.durations) ? Number(payload.durations[0]) : Number(payload.durations);
    }
    if (payload.pricePerLesson !== undefined) serviceAndPricing.pricePerLesson = Number(payload.pricePerLesson);

    if (ownPoolPayload !== undefined) {
      serviceAndPricing.ownPool = ownPoolPayload;
    } else if (allNewImages.length > 0) {
      if (!serviceAndPricing.ownPool) {
        serviceAndPricing.ownPool = {
          enabled: false,
          address: '',
          images: allNewImages,
          location: { type: 'Point', coordinates: [0, 0] }
        };
      } else {
        const existing = Array.isArray(serviceAndPricing.ownPool.images) ? serviceAndPricing.ownPool.images : [];
        serviceAndPricing.ownPool.images = Array.from(new Set([...existing, ...allNewImages]));
      }
    }

    // Clean up any legacy root images field if present
    if (serviceAndPricing.images !== undefined) {
      serviceAndPricing.set('images', undefined);
    }

    if (payload.travelToClient !== undefined) serviceAndPricing.travelToClient = payload.travelToClient;
    if (payload.publicPools !== undefined) serviceAndPricing.publicPools = payload.publicPools;
    if (payload.ageGroups !== undefined) serviceAndPricing.ageGroups = payload.ageGroups;
    if (payload.languages !== undefined) serviceAndPricing.languages = payload.languages;
    if (payload.goodToKnow !== undefined) serviceAndPricing.goodToKnow = payload.goodToKnow;
  }

  await serviceAndPricing.save();
  return serviceAndPricing;
};

// Add a single public pool (Figma: Add pool modal 40012599:4787)
const addPublicPoolService = async (instructorId, poolData) => {
  if (!mongoose.Types.ObjectId.isValid(instructorId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid instructor ID');
  }

  let serviceAndPricing = await ServiceAndPricing.findOne({ instructor: instructorId });
  if (!serviceAndPricing) {
    serviceAndPricing = new ServiceAndPricing({
      instructor: instructorId,
      publicPools: { enabled: true, pools: [] }
    });
  }

  const normalized = normalizePool(poolData);
  if (!normalized || !normalized.poolName) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Pool name is required');
  }

  if (!serviceAndPricing.publicPools) {
    serviceAndPricing.publicPools = { enabled: true, pools: [] };
  }

  serviceAndPricing.publicPools.enabled = true;
  serviceAndPricing.publicPools.pools.push(normalized);

  await serviceAndPricing.save();
  return serviceAndPricing;
};

// Delete a public pool by ID (Figma: Cross icon 40012599:4589)
const deletePublicPoolService = async (instructorId, poolId) => {
  if (!mongoose.Types.ObjectId.isValid(instructorId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid instructor ID');
  }

  const serviceAndPricing = await ServiceAndPricing.findOne({ instructor: instructorId });
  if (!serviceAndPricing) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Service and pricing not found');
  }

  if (!poolId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Pool ID is required');
  }

  const initialCount = serviceAndPricing.publicPools?.pools?.length || 0;
  if (!serviceAndPricing.publicPools || !Array.isArray(serviceAndPricing.publicPools.pools) || initialCount === 0) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Pool not found');
  }

  serviceAndPricing.publicPools.pools = serviceAndPricing.publicPools.pools.filter(
    (p) => p._id.toString() !== String(poolId)
  );

  if (serviceAndPricing.publicPools.pools.length === initialCount) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Pool not found');
  }

  await serviceAndPricing.save();
  return serviceAndPricing;
};

// Update an existing public pool
const updatePublicPoolService = async (instructorId, poolId, poolData) => {
  if (!mongoose.Types.ObjectId.isValid(instructorId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid instructor ID');
  }
  if (!poolId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Pool ID is required');
  }

  const serviceAndPricing = await ServiceAndPricing.findOne({ instructor: instructorId });
  if (!serviceAndPricing) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Service and pricing not found');
  }

  const pool = serviceAndPricing.publicPools?.pools?.id(poolId) ||
    serviceAndPricing.publicPools?.pools?.find((p) => p._id.toString() === String(poolId));

  if (!pool) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Pool not found');
  }

  if (poolData.poolName !== undefined) pool.poolName = poolData.poolName.trim();
  if (poolData.address !== undefined || poolData.location !== undefined) {
    const locStr = (poolData.address || (typeof poolData.location === 'string' ? poolData.location : '') || '').trim();
    pool.address = locStr;
    pool.location = typeof poolData.location === 'object' && poolData.location !== null ? poolData.location : (locStr || { type: 'Point', coordinates: [0, 0] });
  }
  if (poolData.entryFee !== undefined) {
    const rawFee = Number(String(poolData.entryFee).replace(/[^0-9.]/g, ''));
    pool.entryFee = isNaN(rawFee) ? 0 : rawFee;
  }
  if (poolData.hasEntryFee !== undefined) {
    pool.hasEntryFee = typeof poolData.hasEntryFee === 'string' ? poolData.hasEntryFee === 'true' : Boolean(poolData.hasEntryFee);
    if (!pool.hasEntryFee) pool.entryFee = 0;
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
const getInstructorServiceAndPricing = async (instructorId, currentUserId = null) => {
  if (!mongoose.Types.ObjectId.isValid(instructorId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid instructor ID');
  }

  const instructorObjectId = new mongoose.Types.ObjectId(String(instructorId));

  // 1. Fetch Instructor Profile
  const instructor = await User.findById(instructorObjectId).select(
    'fullName email number countryCode image role avgRating totalReviews ratingCount bio about address experience certifications certification isVerified lessonsTaught teaches speaks'
  );

  if (!instructor || instructor.role !== 'instructor') {
    throw new ApiError(httpStatus.NOT_FOUND, 'Instructor not found');
  }

  // 2. Fetch Service & Pricing
  const serviceAndPricing = await ServiceAndPricing.findOne({ instructor: instructorObjectId });

  // 3. Check favourite status for the user
  let isFavourite = false;
  if (currentUserId && mongoose.Types.ObjectId.isValid(currentUserId)) {
    const userObjectId = new mongoose.Types.ObjectId(String(currentUserId));
    const targetIds = [instructorObjectId];
    if (serviceAndPricing?._id && mongoose.Types.ObjectId.isValid(serviceAndPricing._id)) {
      targetIds.push(new mongoose.Types.ObjectId(String(serviceAndPricing._id)));
    }
    const favDoc = await Favourite.findOne({
      user: userObjectId,
      $or: [
        { instructor: { $in: targetIds } },
        { service: { $in: targetIds } }
      ]
    });
    isFavourite = !!favDoc;
  }

  const experienceYears = (instructor.experience?.years !== undefined && instructor.experience?.years !== null)
    ? Number(instructor.experience.years)
    : 0;

  const certifications = instructor.certifications || instructor.certification?.name || '';
  const isVerified = Boolean(instructor.isVerified);
  const badgeText = isVerified ? 'Checked by SwimLetes' : '';
  const avgRating = typeof instructor.avgRating === 'number' ? instructor.avgRating : (Number(instructor.avgRating) || 0);
  const totalReviews = typeof instructor.totalReviews === 'number' ? instructor.totalReviews : (Number(instructor.totalReviews) || 0);
  const lessonsTaught = typeof instructor.lessonsTaught === 'number' ? instructor.lessonsTaught : (Number(instructor.lessonsTaught) || 0);

  return {
    isFavourite,
    instructor: {
      _id: instructor._id,
      fullName: instructor.fullName || '',
      email: instructor.email || '',
      image: instructor.image || '',
      address: instructor.address || serviceAndPricing?.ownPool?.address || '',
      bio: instructor.bio || instructor.about || '',
      experienceYears,
      certifications,
      isVerified,
      badgeText,
      avgRating,
      totalReviews,
      lessonsTaught,
      isFavourite
    },
    serviceAndPricing: serviceAndPricing || null
  };
};

module.exports = {
  createOrUpdateServiceAndPricing,
  getMyServiceAndPricing,
  getInstructorServiceAndPricing,
  addPublicPoolService,
  deletePublicPoolService,
  updatePublicPoolService
};
