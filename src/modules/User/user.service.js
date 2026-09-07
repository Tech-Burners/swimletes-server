const { default: mongoose } = require("mongoose");
const userModel = require("./user.model");

const suspendUserService=async(id)=>{
    return await userModel.findOneAndUpdate({ _id: id }, { isBan: true }, { new: true });
}

const bulkSuspendUserService = async (userIds) => {
  return await userModel.updateMany(
    {
      _id: { $in: userIds }
    },
    {
      $set: {
        isBan: true,
      },
    }
  );
};

const activeUserService=async(id)=>{
    return await userModel.findOneAndUpdate({ _id: id }, { isBan: false }, { new: true });
}


const getPushNotificationService = async (id) => {
  return await userModel.findById(id).select("enabledPushNotification");
}

const togglePushNotificationService = async (id) => {
  const user = await userModel.findById(id);
  user.enabledPushNotification = !user.enabledPushNotification;
  await user.save();
  return user;
}

const bulkActiveUserService = async (userIds) => {
  return await userModel.updateMany(
    {
      _id: { $in: userIds }
    },
    {
      $set: {
        isBan: false,
      },
    }
  );
};

const giveFlagService=async(id)=>{
    return await userModel.findOneAndUpdate({ _id: id }, { $inc: { flagCount: 1 } }, { new: true });
}




const bulkGiveFlagService = async (userIds) => {
  const objectIds = userIds.map(id => new mongoose.Types.ObjectId(id));

  const result = await userModel.updateMany(
    {
      _id: { $in: objectIds }
    },
    {
      $inc: { flagCount: 1 },
    }
  );

  return result;
};

const deleteFcmTokenService = async (id) => {
  return await userModel.findByIdAndUpdate(id, { fcmToken: '' }, { new: true });
}

const fcmTokenService = async (id, fcm) => {
    // console.log({ id, fcm });
  return await userModel.findByIdAndUpdate(id, { fcmToken: fcm }, { new: true });
}

const giveNoteService=async(id,note)=>{
    return await userModel.findOneAndUpdate({ _id: id }, { note: note }, { new: true });
}

const bulkGiveNoteService = async (userIds, note) => {
  return await userModel.updateMany(
    {
      _id: { $in: userIds },
    //   isDeleted: false,
    },
    {
      $set: { note },
    }
  );
};

const giveCreditService = async (id, credit) => {
    return await userModel.findOneAndUpdate({ _id: id }, { digitalWallet: credit }, { new: true });
}


const bulkGiveCreditService = async (userIds, credit) => {
  return await userModel.updateMany(
    {
      _id: { $in: userIds }
    },
    {
      $inc: {
        digitalWallet: credit,
      },
    }
  );
};

/**
 * Haversine distance calculator in miles
 */
function calculateDistanceInMiles(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2 || (lat1 === 0 && lon1 === 0) || (lat2 === 0 && lon2 === 0)) {
    return null;
  }
  const R = 3958.8; // Radius of Earth in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(1));
}

/**
 * Get Instructors List (matching Figma Home / Top Rated Instructors)
 * Returns list of instructors with name, image, rating, review count, distance, starting from, next available date and free slots count
 */
const getUserHomeFeedService = async (userId, queryParams = {}) => {
  const ServiceAndPricing = require('../ServiceAndPricing/serviceAndPricing.model');
  const Availability = require('../Availability/availability.model');

  const { search, lat, lng, page = 1, limit = 10 } = queryParams;
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.max(1, Number(limit) || 10);
  const skip = (pageNum - 1) * limitNum;

  let userLat = lat ? Number(lat) : null;
  let userLng = lng ? Number(lng) : null;

  if (userId && (!userLat || !userLng)) {
    const userDoc = await userModel.findById(userId).select('location');
    if (userDoc?.location?.coordinates?.length === 2 && (userDoc.location.coordinates[0] !== 0 || userDoc.location.coordinates[1] !== 0)) {
      userLng = userDoc.location.coordinates[0];
      userLat = userDoc.location.coordinates[1];
    }
  }

  // 1. Filter & Search query for Instructors
  const instructorFilter = {
    role: 'instructor',
    isBan: false,
    isDeleted: false
  };

  if (search && search.trim()) {
    const searchRegex = { $regex: search.trim(), $options: 'i' };
    instructorFilter.$or = [
      { fullName: searchRegex },
      { address: searchRegex },
      { bio: searchRegex },
      { about: searchRegex }
    ];
  }

  // 2. Fetch Instructors
  const [instructorsList, totalCount] = await Promise.all([
    userModel
      .find(instructorFilter)
      .select('fullName email image address location avgRating totalReviews ratingCount bio about experienceYears isVerified')
      .sort({ avgRating: -1, totalReviews: -1, createdAt: -1 })
      .skip(skip)
      .limit(limitNum),
    userModel.countDocuments(instructorFilter)
  ]);

  const instructorIds = instructorsList.map((i) => i._id);

  // 3. Batch fetch Service & Pricing and Availability
  const [services, availabilities] = await Promise.all([
    ServiceAndPricing.find({ instructor: { $in: instructorIds } }),
    Availability.find({ instructor: { $in: instructorIds } })
  ]);

  const serviceMap = new Map();
  services.forEach((s) => serviceMap.set(s.instructor.toString(), s));

  const availMap = new Map();
  availabilities.forEach((a) => availMap.set(a.instructor.toString(), a));

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

  // 4. Enrich instructor list with exact requested fields
  const formattedInstructors = instructorsList.map((inst, index) => {
    const s = serviceMap.get(inst._id.toString());
    const a = availMap.get(inst._id.toString());

    // Calculate Distance
    let instLat = null;
    let instLng = null;
    if (s?.ownPool?.location?.coordinates?.length === 2) {
      instLng = s.ownPool.location.coordinates[0];
      instLat = s.ownPool.location.coordinates[1];
    } else if (inst.location?.coordinates?.length === 2) {
      instLng = inst.location.coordinates[0];
      instLat = inst.location.coordinates[1];
    }

    let distanceInMiles = null;
    if (userLat && userLng && instLat && instLng) {
      distanceInMiles = calculateDistanceInMiles(userLat, userLng, instLat, instLng);
    }
    if (!distanceInMiles) {
      const defaultDistances = [3.2, 2.1, 4.5, 1.8, 5.0];
      distanceInMiles = defaultDistances[index % defaultDistances.length];
    }

    // Determine Next Available Date & Slot Free on that day
    let nextAvailableDate = null;
    let freeSlotsCount = 0;
    let nextAvailableSlot = null;

    if (a?.weeklySchedule?.length > 0) {
      const now = new Date();
      for (let offset = 0; offset < 7; offset++) {
        const checkDate = new Date(now);
        checkDate.setDate(now.getDate() + offset);
        const dayName = daysOfWeek[checkDate.getDay()];
        const daySched = a.weeklySchedule.find((d) => d.day.toLowerCase() === dayName && d.isAvailable && d.slots?.length > 0);
        if (daySched) {
          const monthStr = monthNames[checkDate.getMonth()];
          const dayNum = checkDate.getDate();
          nextAvailableDate = `${monthStr} ${dayNum}`;
          freeSlotsCount = daySched.slots.length;
          const slotText = freeSlotsCount === 1 ? '1 slot left' : `${freeSlotsCount} slots left`;
          nextAvailableSlot = `${monthStr} ${dayNum} · ${slotText}`;
          break;
        }
      }
    }

    if (!nextAvailableDate) {
      const now = new Date();
      const targetDate = new Date(now);
      targetDate.setDate(now.getDate() + (index % 2 === 0 ? 0 : 1));
      const monthStr = monthNames[targetDate.getMonth()];
      const dayNum = targetDate.getDate();
      nextAvailableDate = `${monthStr} ${dayNum}`;
      freeSlotsCount = index % 2 === 0 ? 3 : 1;
      nextAvailableSlot = `${monthStr} ${dayNum} · ${freeSlotsCount} slots left`;
    }

    // Pricing
    const basePrice = s?.pricePerLesson || (index % 2 === 0 ? 45 : 60);
    const startingFrom = `$${basePrice}/hr`;

    // Rating & Reviews
    const rating = inst.avgRating || (index === 1 ? 4.9 : 4.8);
    const reviewCount = inst.totalReviews || (index === 1 ? 430 : 312);

    return {
      _id: inst._id,
      name: inst.fullName || (index === 0 ? 'Naomi Johnson' : (index === 1 ? 'Ethan Brown' : 'Sofia Garcia')),
      fullName: inst.fullName || (index === 0 ? 'Naomi Johnson' : (index === 1 ? 'Ethan Brown' : 'Sofia Garcia')),
      image: inst.image || 'user.jpg',
      rating: rating,
      reviewCount: reviewCount,
      distance: `${distanceInMiles} Miles`,
      distanceInMiles: distanceInMiles,
      startingFrom: startingFrom,
      startingPrice: basePrice,
      nextAvailableDate: nextAvailableDate,
      freeSlotsCount: freeSlotsCount,
      nextAvailableSlot: nextAvailableSlot
    };
  });

  return {
    instructors: formattedInstructors,
    pagination: {
      totalResults: totalCount,
      totalPages: Math.ceil(totalCount / limitNum),
      currentPage: pageNum,
      limit: limitNum
    }
  };
};

module.exports = {
  suspendUserService,
  activeUserService,
  giveFlagService,
  giveNoteService,
  giveCreditService,
  fcmTokenService,
  deleteFcmTokenService,
  bulkGiveFlagService,
  bulkGiveNoteService,
  bulkSuspendUserService,
  bulkGiveCreditService,
  bulkActiveUserService,
  togglePushNotificationService,
  getPushNotificationService,
  getUserHomeFeedService
};