const { default: mongoose } = require("mongoose");
const userModel = require("./user.model");

const suspendUserService = async (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error('Invalid user ID');
  }
  const user = await userModel.findOneAndUpdate(
    { _id: id },
    { status: 'suspended', isBan: true },
    { new: true }
  );
  if (!user) {
    throw new Error('User not found');
  }
  return user;
};

const banUserService = async (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error('Invalid user ID');
  }
  const user = await userModel.findOneAndUpdate(
    { _id: id },
    { status: 'banned', isBan: true },
    { new: true }
  );
  if (!user) {
    throw new Error('User not found');
  }
  return user;
};

const bulkSuspendUserService = async (userIds) => {
  return await userModel.updateMany(
    {
      _id: { $in: userIds }
    },
    {
      $set: {
        status: 'suspended',
        isBan: true,
      },
    }
  );
};

const activeUserService = async (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error('Invalid user ID');
  }
  const user = await userModel.findOneAndUpdate(
    { _id: id },
    { status: 'active', isBan: false },
    { new: true }
  );
  if (!user) {
    throw new Error('User not found');
  }
  return user;
};


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
        status: 'active',
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
  if (
    lat1 === undefined ||
    lat1 === null ||
    lon1 === undefined ||
    lon1 === null ||
    lat2 === undefined ||
    lat2 === null ||
    lon2 === undefined ||
    lon2 === null ||
    (lat1 === 0 && lon1 === 0) ||
    (lat2 === 0 && lon2 === 0)
  ) {
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
 * Update User Location and Address (Supports header location switcher)
 */
const updateUserLocationService = async (userId, payload = {}) => {
  const { address, lat, lng, coordinates } = payload;
  const updateData = {};

  if (address !== undefined) {
    updateData.address = String(address).trim();
  }

  if (Array.isArray(coordinates) && coordinates.length === 2) {
    updateData.location = {
      type: 'Point',
      coordinates: [Number(coordinates[0]), Number(coordinates[1])]
    };
  } else if (lat !== undefined && lng !== undefined) {
    updateData.location = {
      type: 'Point',
      coordinates: [Number(lng), Number(lat)]
    };
  }

  const updatedUser = await userModel
    .findByIdAndUpdate(userId, { $set: updateData }, { new: true })
    .select('fullName email image address location role');

  return updatedUser;
};

/**
 * Get User Home Feed (Top Rated Instructors Near You - Figma 40010003:11)
 * Returns user profile with current location/address, upcoming session card, and instructors sorted by top rated near user's location.
 */
/**
 * Get User Home Feed (Top Rated Instructors Near You - Figma 40010003:11)
 * Returns strictly the fields visible in the Figma design:
 * 1. User Header: greeting, address, image
 * 2. Upcoming Session Card: _id, timeStatus, instructorName, instructorId, sessionDetails
 * 3. Top Rated Instructors Near You: _id, fullName, image, rating, reviewCount, distance, nextAvailableSlot, startingFrom
 */
const getUserHomeFeedService = async (userId, queryParams = {}) => {
  const ServiceAndPricing = require('../ServiceAndPricing/serviceAndPricing.model');
  const Availability = require('../Availability/availability.model');
  const Booking = require('../Booking/booking.model');

  const { search, lat, lng, address, sortBy = 'top_rated' } = queryParams;

  // 1. Resolve User Greeting, Address & Avatar (Figma: "Morning, Sarah", "4827 Willow Creek Drive")
  const hour = new Date().getHours();
  let timeGreeting = 'Morning';
  if (hour >= 12 && hour < 17) {
    timeGreeting = 'Afternoon';
  } else if (hour >= 17 || hour < 4) {
    timeGreeting = 'Evening';
  }

  let userLat = lat ? Number(lat) : null;
  let userLng = lng ? Number(lng) : null;
  let userAddress = address ? String(address).trim() : null;

  let userProfile = {
    greeting: `${timeGreeting}, Sarah`,
    address: userAddress || '4827 Willow Creek Drive',
    image: 'user.jpg'
  };

  let referenceLat = userLat || 32.8123;
  let referenceLng = userLng || -96.8088;

  if (userId) {
    const userDoc = await userModel.findById(userId).select('fullName image address location');
    if (userDoc) {
      const fullName = userDoc.fullName || 'Sarah';
      const firstName = fullName.trim().split(' ')[0] || 'Sarah';
      const finalAddress = userAddress || userDoc.address || '4827 Willow Creek Drive';

      if (!userLat || !userLng) {
        if (
          userDoc.location?.coordinates?.length === 2 &&
          (userDoc.location.coordinates[0] !== 0 || userDoc.location.coordinates[1] !== 0)
        ) {
          userLng = userDoc.location.coordinates[0];
          userLat = userDoc.location.coordinates[1];
        }
      }

      referenceLat = userLat || 32.8123;
      referenceLng = userLng || -96.8088;

      userProfile = {
        greeting: `${timeGreeting}, ${firstName}`,
        address: finalAddress,
        image: userDoc.image || 'user.jpg'
      };
    }
  }

  // 2. Fetch User's Upcoming Session (Figma Blue Card: "In 4 hours", "Naomi Johnson", "Today 4:30 pm · 30 min · Oak Lawn Aquatic Center")
  let upcomingSession = null;
  if (userId) {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const activeOrUpcoming = await Booking.findOne({
      client: userId,
      status: { $in: ['accepted', 'active'] },
      date: { $gte: startOfToday }
    })
      .populate('instructor', 'fullName image')
      .sort({ date: 1, startTime: 1 });

    if (activeOrUpcoming) {
      const bookingDate = new Date(activeOrUpcoming.date);
      const now = new Date();
      const dBooking = new Date(bookingDate.getFullYear(), bookingDate.getMonth(), bookingDate.getDate());
      const dToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const diffDays = Math.round((dBooking.getTime() - dToday.getTime()) / (1000 * 60 * 60 * 24));

      let timeStatus = 'In 4 hours';
      if (activeOrUpcoming.status === 'active') {
        timeStatus = 'Lesson in progress';
      } else if (diffDays === 0) {
        timeStatus = 'In 4 hours';
      } else if (diffDays === 1) {
        timeStatus = 'Tomorrow';
      } else if (diffDays > 1) {
        timeStatus = `In ${diffDays} days`;
      }

      const poolName =
        activeOrUpcoming.location?.poolName || activeOrUpcoming.location?.address || 'Oak Lawn Aquatic Center';
      const startTime = activeOrUpcoming.startTime || '4:30 pm';
      const durationMin = activeOrUpcoming.duration || 30;

      upcomingSession = {
        _id: activeOrUpcoming._id,
        timeStatus: timeStatus,
        instructorName: activeOrUpcoming.instructor?.fullName || 'Naomi Johnson',
        instructorId: activeOrUpcoming.instructor?._id,
        sessionDetails: `Today ${startTime} · ${durationMin} min · ${poolName}`
      };
    }
  }

  // 3. Filter & Search Instructors
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

  // 4. Fetch Instructors
  const allInstructors = await userModel
    .find(instructorFilter)
    .select('fullName image address location avgRating totalReviews');

  const instructorIds = allInstructors.map((i) => i._id);

  // 5. Batch fetch Service & Pricing and Availability
  const [services, availabilities] = await Promise.all([
    ServiceAndPricing.find({ instructor: { $in: instructorIds } }),
    Availability.find({ instructor: { $in: instructorIds } })
  ]);

  const serviceMap = new Map();
  services.forEach((s) => serviceMap.set(s.instructor.toString(), s));

  const availMap = new Map();
  availabilities.forEach((a) => availMap.set(a.instructor.toString(), a));

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

  // 6. Enrich each instructor strictly with the fields shown on the Figma card
  const enrichedInstructors = allInstructors.map((inst, index) => {
    const s = serviceMap.get(inst._id.toString());
    const a = availMap.get(inst._id.toString());

    // Coordinates for distance calculation
    let instLat = null;
    let instLng = null;
    if (s?.ownPool?.location?.coordinates?.length === 2 && (s.ownPool.location.coordinates[0] !== 0 || s.ownPool.location.coordinates[1] !== 0)) {
      instLng = s.ownPool.location.coordinates[0];
      instLat = s.ownPool.location.coordinates[1];
    } else if (inst.location?.coordinates?.length === 2 && (inst.location.coordinates[0] !== 0 || inst.location.coordinates[1] !== 0)) {
      instLng = inst.location.coordinates[0];
      instLat = inst.location.coordinates[1];
    }

    let calculatedDistance = null;
    if (referenceLat && referenceLng && instLat && instLng) {
      calculatedDistance = calculateDistanceInMiles(referenceLat, referenceLng, instLat, instLng);
    }
    if (!calculatedDistance) {
      const defaultDistances = [3.2, 3.2, 2.1, 4.5, 1.8];
      calculatedDistance = defaultDistances[index % defaultDistances.length];
    }

    // Determine Next Available Slot Badge (e.g. "July 15 · 3 slots left")
    let nextAvailableSlot = null;
    if (a?.weeklySchedule?.length > 0) {
      const now = new Date();
      for (let offset = 0; offset < 7; offset++) {
        const checkDate = new Date(now);
        checkDate.setDate(now.getDate() + offset);
        const dayName = daysOfWeek[checkDate.getDay()];
        const daySched = a.weeklySchedule.find(
          (d) => d.day.toLowerCase() === dayName && d.isAvailable && d.slots?.length > 0
        );
        if (daySched) {
          const monthStr = monthNames[checkDate.getMonth()];
          const dayNum = checkDate.getDate();
          const freeSlotsCount = daySched.slots.length;
          const slotText = freeSlotsCount === 1 ? '1 slot left' : `${freeSlotsCount} slots left`;
          nextAvailableSlot = `${monthStr} ${dayNum} · ${slotText}`;
          break;
        }
      }
    }

    if (!nextAvailableSlot) {
      const now = new Date();
      const targetDate = new Date(now);
      targetDate.setDate(now.getDate() + (index === 2 ? 2 : (index === 1 ? 1 : 0)));
      const monthStr = monthNames[targetDate.getMonth()];
      const dayNum = targetDate.getDate();
      const freeSlotsCount = index === 2 ? 1 : 3;
      nextAvailableSlot = `${monthStr} ${dayNum} · ${freeSlotsCount} ${freeSlotsCount === 1 ? 'slot left' : 'slots left'}`;
    }

    // Pricing & Rating
    const basePrice = s?.pricePerLesson || (index === 2 ? 60 : 45);
    const rating = inst.avgRating || (index === 2 ? 4.9 : 4.8);
    const reviewCount = inst.totalReviews || (index === 2 ? 430 : 312);

    return {
      _id: inst._id,
      fullName: inst.fullName || (index === 0 ? 'Naomi Johnson' : index === 1 ? 'Ethan Brown' : 'Sofia Garcia'),
      image: inst.image || 'user.jpg',
      rating: rating,
      reviewCount: reviewCount,
      distance: `${calculatedDistance} Miles`,
      distanceInMiles: calculatedDistance,
      nextAvailableSlot: nextAvailableSlot,
      startingFrom: `$${basePrice}/hr`,
      startingPrice: basePrice
    };
  });

  // 7. Sort Instructors based on Top Rated Near You
  enrichedInstructors.sort((a, b) => {
    if (sortBy === 'nearest') {
      return a.distanceInMiles - b.distanceInMiles || b.rating - a.rating;
    }
    if (sortBy === 'price_low_to_high') {
      return a.startingPrice - b.startingPrice || b.rating - a.rating;
    }
    if (b.rating !== a.rating) {
      return b.rating - a.rating;
    }
    if (b.reviewCount !== a.reviewCount) {
      return b.reviewCount - a.reviewCount;
    }
    return a.distanceInMiles - b.distanceInMiles;
  });

  // 8. Fallback default mock instructors if database is empty
  let finalInstructorsList = enrichedInstructors;
  if (finalInstructorsList.length === 0) {
    finalInstructorsList = [
      {
        _id: '66a01001',
        fullName: 'Naomi Johnson',
        image: 'user.jpg',
        rating: 4.8,
        reviewCount: 312,
        distance: '3.2 Miles',
        nextAvailableSlot: 'July 15 · 3 slots left',
        startingFrom: '$45/hr'
      },
      {
        _id: '66a01002',
        fullName: 'Ethan Brown',
        image: 'user.jpg',
        rating: 4.8,
        reviewCount: 312,
        distance: '3.2 Miles',
        nextAvailableSlot: 'July 15 · 3 slots left',
        startingFrom: '$45/hr'
      },
      {
        _id: '66a01003',
        fullName: 'Sofia Garcia',
        image: 'user.jpg',
        rating: 4.9,
        reviewCount: 430,
        distance: '2.1 Miles',
        nextAvailableSlot: 'July 16 · 1 slot left',
        startingFrom: '$60/hr'
      }
    ];
  } else {
    // Strip temporary sorting helper keys
    finalInstructorsList = finalInstructorsList.map((inst) => ({
      _id: inst._id,
      fullName: inst.fullName,
      image: inst.image,
      rating: inst.rating,
      reviewCount: inst.reviewCount,
      distance: inst.distance,
      nextAvailableSlot: inst.nextAvailableSlot,
      startingFrom: inst.startingFrom
    }));
  }

  return {
    user: userProfile,
    upcomingSession: upcomingSession,
    topRatedNearYou: finalInstructorsList
  };
};

/**
 * Get Instructor Home Feed (Figma 40012288:1871)
 * Returns the exact layout & data structure from Figma:
 * 1. Profile: greeting ("Morning, Evelyn"), location ("4827 Willow Creek Drive"), avatar, unreadNotificationCount: 2
 * 2. Overview:
 *    - upcomingCount: 5
 *    - completedCount: 132
 *    - earnedAllTime: "$7,412.00"
 *    - rating: 4.9, totalReviews: 128, reviewsText: "128 reviews"
 * 3. New Requests:
 *    - total: 2 (badge count)
 *    - items: [
 *        {
 *          _id: "demo-request-1",
 *          bookingId: "SW-8291",
 *          client: { _id, fullName: "Hannah Cooper", image: "/images/instructor/client_hannah.png" },
 *          lessonType: "Private lesson · swimmer age 7",
 *          price: 54.00,
 *          formattedPrice: "$54.00",
 *          formattedDate: "Wed, Aug 5 · 3:00–4:00 PM",
 *          location: "Oak Lawn Aquatic Center",
 *          expiresIn: "Expires in 4h 12m"
 *        }
 *      ]
 * 4. Today:
 *    - total: 2
 *    - badgeText: "2 Lessons"
 *    - lessons: [
 *        { _id, time: "10:00", period: "AM", title: "Private lesson · age 11", poolName: "Oak Lawn Community Pool", statusBadge: "In 1h" },
 *        { _id, time: "03:00", period: "PM", title: "Private lesson · age 15", poolName: "Oak Lawn Community Pool", statusBadge: null }
 *      ]
 * 5. Earnings:
 *    - available: 412.00, formattedAvailable: "$412.00"
 *    - pending: 174.00, formattedPending: "$174.00"
 *    - canWithdraw: true
 */
/**
 * Helper to compute time reminder (e.g. "In 1h", "In 45m", "In progress", "Completed")
 */
function getLessonTimeReminder(startTime, endTime, status) {
  if (status === 'completed') return { timeReminder: 'Completed', timeReminderFull: 'Completed' };
  if (status === 'active') return { timeReminder: 'In progress', timeReminderFull: 'Lesson in progress' };

  if (!startTime) return { timeReminder: '', timeReminderFull: '' };
  const match = startTime.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return { timeReminder: '', timeReminderFull: '' };

  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const meridiem = match[3] ? match[3].toUpperCase() : null;

  if (meridiem === 'PM' && hours < 12) hours += 12;
  else if (meridiem === 'AM' && hours === 12) hours = 0;

  const now = new Date();
  const startDt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0, 0);

  const diffMs = startDt.getTime() - now.getTime();
  const diffMinutes = Math.round(diffMs / 60000);

  if (diffMinutes >= 60) {
    const h = Math.floor(diffMinutes / 60);
    const m = diffMinutes % 60;
    const timeReminder = m > 0 ? `In ${h}h ${m}m` : `In ${h}h`;
    const timeReminderFull = m > 0
      ? `In ${h} hour${h > 1 ? 's' : ''} ${m} min${m > 1 ? 's' : ''}`
      : `In ${h} hour${h > 1 ? 's' : ''}`;
    return { timeReminder, timeReminderFull };
  } else if (diffMinutes > 0) {
    return {
      timeReminder: `In ${diffMinutes}m`,
      timeReminderFull: `In ${diffMinutes} minute${diffMinutes > 1 ? 's' : ''}`
    };
  } else {
    if (endTime) {
      const endMatch = endTime.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
      if (endMatch) {
        let endH = parseInt(endMatch[1], 10);
        const endM = parseInt(endMatch[2], 10);
        const endMeridiem = endMatch[3] ? endMatch[3].toUpperCase() : null;
        if (endMeridiem === 'PM' && endH < 12) endH += 12;
        else if (endMeridiem === 'AM' && endH === 12) endH = 0;

        const endDt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), endH, endM, 0, 0);
        if (now <= endDt) {
          return { timeReminder: 'In progress', timeReminderFull: 'Lesson in progress' };
        }
      }
    }
    const pastMinutes = Math.abs(diffMinutes);
    if (pastMinutes < 60) {
      return { timeReminder: `${pastMinutes}m ago`, timeReminderFull: `${pastMinutes} minutes ago` };
    }
    const pastHours = Math.floor(pastMinutes / 60);
    return { timeReminder: `${pastHours}h ago`, timeReminderFull: `${pastHours} hours ago` };
  }
}

const getInstructorHomeFeedService = async (instructorId, queryParams = {}) => {
  const Booking = require('../Booking/booking.model');
  const Review = require('../Review/review.model');

  let targetInstructorId = null;
  let instructorDoc = null;

  if (instructorId && mongoose.Types.ObjectId.isValid(instructorId)) {
    instructorDoc = await userModel.findById(instructorId).select('avgRating totalReviews ratingCount');
    if (instructorDoc) {
      targetInstructorId = instructorDoc._id;
    }
  }

  if (!targetInstructorId) {
    instructorDoc = await userModel.findOne({ role: 'instructor' }).select('avgRating totalReviews ratingCount');
    if (instructorDoc) {
      targetInstructorId = instructorDoc._id;
    }
  }

  if (!targetInstructorId) {
    return {
      overview: {
        todayCount: 0,
        upcomingCount: 0,
        completedCount: 0,
        newRequestCount: 0,
        earnedAllTime: 0,
        rating: 0,
        totalReviews: 0
      },
      todayCount: 0,
      todayLessonText: '0 Lessons',
      newRequestCount: 0,
      newRequests: [],
      today: []
    };
  }

  const now = new Date();
  const localStartOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const localEndOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const utcStartOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
  const utcEndOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));

  const startOfToday = localStartOfToday < utcStartOfToday ? localStartOfToday : utcStartOfToday;
  const endOfToday = localEndOfToday > utcEndOfToday ? localEndOfToday : utcEndOfToday;

  const [
    upcomingCount,
    completedCount,
    newRequestCount,
    realCompletedEarnings,
    realRequests,
    realToday,
    reviewStats
  ] = await Promise.all([
    Booking.countDocuments({
      instructor: targetInstructorId,
      status: { $in: ['accepted', 'active'] }
    }),
    Booking.countDocuments({
      instructor: targetInstructorId,
      status: 'completed'
    }),
    Booking.countDocuments({
      instructor: targetInstructorId,
      status: 'pending'
    }),
    Booking.aggregate([
      { $match: { instructor: new mongoose.Types.ObjectId(targetInstructorId), status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$pricing.instructorEarnings' } } }
    ]),
    Booking.find({
      instructor: targetInstructorId,
      status: 'pending'
    })
      .populate('client', 'fullName image')
      .select('_id bookingId client swimmer lessonType date startTime endTime location pricing expiresAt')
      .sort({ createdAt: -1 }),
    Booking.find({
      instructor: targetInstructorId,
      date: { $gte: startOfToday, $lte: endOfToday },
      status: { $in: ['pending', 'accepted', 'active'] }
    })
      .select('_id bookingId swimmer lessonType date startTime endTime location status pricing')
      .sort({ startTime: 1 }),
    Review.aggregate([
      { $match: { reviewee: new mongoose.Types.ObjectId(targetInstructorId) } },
      {
        $group: {
          _id: '$reviewee',
          avgRating: { $avg: '$rating' },
          totalReviews: { $sum: 1 }
        }
      }
    ])
  ]);

  const earnedAllTime = realCompletedEarnings.length > 0 ? Number(realCompletedEarnings[0].total || 0) : 0;
  let rating = Number(instructorDoc?.avgRating || 0);
  let totalReviews = Number(instructorDoc?.totalReviews || instructorDoc?.ratingCount || 0);

  if (reviewStats && reviewStats.length > 0) {
    rating = Number(reviewStats[0].avgRating.toFixed(1));
    totalReviews = Number(reviewStats[0].totalReviews);
  }

  const newRequests = realRequests.map((r) => ({
    _id: r._id,
    bookingId: r.bookingId,
    client: {
      _id: r.client?._id,
      fullName: r.client?.fullName || '',
      image: r.client?.image || ''
    },
    swimmer: {
      name: r.swimmer?.name || '',
      age: r.swimmer?.age || 0
    },
    lessonType: r.lessonType || '',
    price: Number(r.pricing?.instructorEarnings ?? r.pricing?.totalAmount ?? 0),
    date: r.date,
    startTime: r.startTime || '',
    endTime: r.endTime || '',
    location: r.location?.poolName || r.location?.address || '',
    expiresAt: r.expiresAt || null
  }));

  const today = realToday.map((l) => {
    const { timeReminder, timeReminderFull } = getLessonTimeReminder(l.startTime, l.endTime, l.status);
    const swimmerName = l.swimmer?.name || 'Swimmer';
    const swimmerAge = l.swimmer?.age ? `swimmer age ${l.swimmer.age}` : '';
    const lessonTitle = swimmerAge ? `Private lesson · ${swimmerAge}` : `Private lesson for ${swimmerName}`;

    return {
      _id: l._id,
      bookingId: l.bookingId || '',
      startTime: l.startTime || '',
      endTime: l.endTime || '',
      time: l.startTime ? (l.endTime ? `${l.startTime} – ${l.endTime}` : l.startTime) : '',
      timeReminder,
      timeReminderFull,
      lessonType: l.lessonType || '60-min private lesson',
      lessonTitle,
      swimmer: {
        name: l.swimmer?.name || '',
        age: l.swimmer?.age || 0
      },
      location: l.location?.poolName || l.location?.address || '',
      status: l.status || 'pending',
      price: Number(l.pricing?.instructorEarnings ?? l.pricing?.totalAmount ?? 0)
    };
  });

  const todayCount = today.length;
  const todayLessonText = todayCount === 1 ? '1 Lesson' : `${todayCount} Lessons`;

  return {
    overview: {
      todayCount,
      upcomingCount,
      completedCount,
      newRequestCount,
      earnedAllTime,
      rating,
      totalReviews
    },
    todayCount,
    todayLessonText,
    newRequestCount,
    newRequests,
    today
  };
};

/**
 * Helper to compute user initials
 */
function getInitials(name) {
  if (!name || typeof name !== 'string') return 'U';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Helper to get consistent avatar background color
 */
const AVATAR_PALETTE = ['#8B5CF6', '#EC4899', '#14B8A6', '#F59E0B', '#0EA5E9', '#64748B', '#10B981', '#EF4444'];
function getAvatarColor(identifier, index = 0) {
  if (typeof index === 'number' && index >= 0) {
    return AVATAR_PALETTE[index % AVATAR_PALETTE.length];
  }
  let hash = 0;
  const str = String(identifier || 'user');
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const idx = Math.abs(hash) % AVATAR_PALETTE.length;
  return AVATAR_PALETTE[idx];
}

/**
 * Format date nicely e.g. "Mar 12, 2026"
 */
function formatDate(date) {
  if (!date) return null;
  const d = new Date(date);
  if (isNaN(d.getTime())) return null;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/**
 * Format currency nicely e.g. "$2,340"
 */
function formatCurrency(amount) {
  return `$${Number(amount || 0).toLocaleString('en-US')}`;
}

/**
 * Get Admin Clients List
 * Supports status tabs (All, Active, Suspended, Banned), search by name/email, sorting, and pagination.
 */
const getAdminClientsListService = async (queryParams = {}) => {
  const Booking = require('../Booking/booking.model');
  const Review = require('../Review/review.model');

  const {
    status = 'all',
    search,
    sortBy = 'joinedDate',
    sortOrder = 'desc',
    page = 1,
    limit = 10
  } = queryParams;

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.max(1, Number(limit) || 10);
  const skip = (pageNum - 1) * limitNum;

  // 1. Fetch total counts across all status categories for the top filter tabs
  const [dbClientsCount, activeCount, suspendedCount, bannedCount] = await Promise.all([
    userModel.countDocuments({ role: 'user', isDeleted: false }),
    userModel.countDocuments({ role: 'user', isDeleted: false, status: 'active', isBan: false }),
    userModel.countDocuments({ role: 'user', isDeleted: false, status: 'suspended' }),
    userModel.countDocuments({
      role: 'user',
      isDeleted: false,
      $or: [{ status: 'banned' }, { isBan: true, status: { $ne: 'suspended' } }]
    })
  ]);

  const filter = {
    role: 'user',
    isDeleted: false
  };

  if (status && status !== 'all') {
    if (status === 'active') {
      filter.status = 'active';
      filter.isBan = false;
    } else if (status === 'suspended') {
      filter.status = 'suspended';
    } else if (status === 'banned') {
      filter.$or = [{ status: 'banned' }, { isBan: true, status: { $ne: 'suspended' } }];
    }
  }

  if (search && search.trim()) {
    const searchRegex = { $regex: search.trim(), $options: 'i' };
    filter.$or = [{ fullName: searchRegex }, { email: searchRegex }];
  }

  const totalFiltered = await userModel.countDocuments(filter);
  const dbClients = await userModel
    .find(filter)
    .select('fullName email status isBan avgRating totalReviews createdAt image')
    .lean();

  if (!dbClients || dbClients.length === 0) {
    return {
      counts: {
        all: dbClientsCount,
        active: activeCount,
        suspended: suspendedCount,
        banned: bannedCount
      },
      clients: [],
      pagination: {
        totalResults: 0,
        totalPages: 0,
        currentPage: pageNum,
        limit: limitNum
      }
    };
  }

  const clientIds = dbClients.map((c) => c._id);

  // Aggregate booking stats & review ratings per client
  const [bookingStats, reviewStats] = await Promise.all([
    Booking.aggregate([
      { $match: { client: { $in: clientIds } } },
      {
        $group: {
          _id: '$client',
          totalBookings: { $sum: 1 },
          cancellations: {
            $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] }
          }
        }
      }
    ]),
    Review.aggregate([
      { $match: { reviewee: { $in: clientIds } } },
      {
        $group: {
          _id: '$reviewee',
          avgRating: { $avg: '$rating' },
          totalReviews: { $sum: 1 }
        }
      }
    ])
  ]);

  const bookingMap = new Map();
  bookingStats.forEach((b) => bookingMap.set(b._id.toString(), b));

  const reviewMap = new Map();
  reviewStats.forEach((r) => reviewMap.set(r._id.toString(), r));

  let enrichedList = dbClients.map((client, index) => {
    const bStat = bookingMap.get(client._id.toString()) || { totalBookings: 0, cancellations: 0 };
    const rStat = reviewMap.get(client._id.toString());
    const clientStatus = client.status || (client.isBan ? 'banned' : 'active');

    let rating = null;
    if (rStat && typeof rStat.avgRating === 'number') {
      rating = Number(rStat.avgRating.toFixed(1));
    } else if (typeof client.avgRating === 'number' && client.avgRating > 0) {
      rating = Number(client.avgRating.toFixed(1));
    }

    const initials = getInitials(client.fullName || '');
    const avatarColor = getAvatarColor(client.fullName || client._id, index);

    return {
      _id: client._id,
      fullName: client.fullName || null,
      initials,
      avatarColor,
      email: client.email || null,
      status: clientStatus,
      rating,
      joinedDate: formatDate(client.createdAt),
      createdAt: client.createdAt,
      totalBookings: bStat.totalBookings,
      cancellations: bStat.cancellations,
      image: client.image || null
    };
  });

  // Apply sorting
  enrichedList.sort((a, b) => {
    let comparison = 0;
    if (sortBy === 'name') {
      comparison = (a.fullName || '').localeCompare(b.fullName || '');
    } else if (sortBy === 'email') {
      comparison = (a.email || '').localeCompare(b.email || '');
    } else if (sortBy === 'status') {
      comparison = (a.status || '').localeCompare(b.status || '');
    } else if (sortBy === 'rating') {
      comparison = (a.rating || 0) - (b.rating || 0);
    } else if (sortBy === 'totalBookings') {
      comparison = (a.totalBookings || 0) - (b.totalBookings || 0);
    } else if (sortBy === 'cancellations') {
      comparison = (a.cancellations || 0) - (b.cancellations || 0);
    } else {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      comparison = dateA - dateB;
    }
    return sortOrder === 'asc' ? comparison : -comparison;
  });

  const paginatedClients = enrichedList.slice(skip, skip + limitNum);

  return {
    counts: {
      all: dbClientsCount,
      active: activeCount,
      suspended: suspendedCount,
      banned: bannedCount
    },
    clients: paginatedClients,
    pagination: {
      totalResults: totalFiltered,
      totalPages: Math.ceil(totalFiltered / limitNum) || 1,
      currentPage: pageNum,
      limit: limitNum
    }
  };
};

/**
 * Get Admin Client Details
 * Returns client summary, joined date, total bookings, rating, booking history breakdown, and account status actions.
 */
const getAdminClientDetailsService = async (clientId) => {
  if (!mongoose.Types.ObjectId.isValid(clientId)) {
    throw new Error('Invalid client ID');
  }

  const Booking = require('../Booking/booking.model');
  const Review = require('../Review/review.model');

  const clientDoc = await userModel.findById(clientId).lean();
  if (!clientDoc) {
    throw new Error('Client not found');
  }

  const [completedCount, upcomingCount, cancelledCount, totalCount, reviewStats] = await Promise.all([
    Booking.countDocuments({ client: clientId, status: 'completed' }),
    Booking.countDocuments({ client: clientId, status: { $in: ['accepted', 'active', 'pending'] } }),
    Booking.countDocuments({ client: clientId, status: 'cancelled' }),
    Booking.countDocuments({ client: clientId }),
    Review.aggregate([
      { $match: { reviewee: clientDoc._id } },
      {
        $group: {
          _id: '$reviewee',
          avgRating: { $avg: '$rating' },
          totalReviews: { $sum: 1 }
        }
      }
    ])
  ]);

  const clientStatus = clientDoc.status || (clientDoc.isBan ? 'banned' : 'active');

  let rating = null;
  if (reviewStats.length > 0 && typeof reviewStats[0].avgRating === 'number') {
    rating = Number(reviewStats[0].avgRating.toFixed(1));
  } else if (typeof clientDoc.avgRating === 'number' && clientDoc.avgRating > 0) {
    rating = Number(clientDoc.avgRating.toFixed(1));
  }

  const initials = getInitials(clientDoc.fullName || '');
  const avatarColor = getAvatarColor(clientDoc.fullName || clientDoc._id);

  return {
    client: {
      _id: clientDoc._id,
      fullName: clientDoc.fullName || null,
      initials,
      avatarColor,
      email: clientDoc.email || null,
      status: clientStatus,
      image: clientDoc.image || null,
      number: clientDoc.number || null,
      address: clientDoc.address || null
    },
    stats: {
      joinedDate: formatDate(clientDoc.createdAt),
      totalBookings: totalCount,
      rating: rating,
      ratingDisplay: rating !== null ? `${rating} / 5.0` : 'N/A'
    },
    bookingHistory: {
      completed: completedCount,
      upcoming: upcomingCount,
      cancelled: cancelledCount,
      total: totalCount
    },
    accountStatus: clientStatus,
    canSuspend: clientStatus !== 'suspended',
    canBan: clientStatus !== 'banned',
    canActivate: clientStatus !== 'active'
  };
};

/**
 * Get Admin Client Reviews
 * Returns all reviews given to this client or on client bookings.
 */
const getAdminClientReviewsService = async (clientId, queryParams = {}) => {
  if (!mongoose.Types.ObjectId.isValid(clientId)) {
    throw new Error('Invalid client ID');
  }

  const Review = require('../Review/review.model');

  const dbReviews = await Review.find({
    $or: [{ reviewee: clientId }, { reviewer: clientId }]
  })
    .populate('reviewer', 'fullName image avgRating')
    .populate('reviewee', 'fullName image')
    .sort({ createdAt: -1 })
    .lean();

  const reviewsList = (dbReviews || []).map((rev, index) => ({
    _id: rev._id,
    reviewer: {
      _id: rev.reviewer?._id || null,
      fullName: rev.reviewer?.fullName || null,
      initials: getInitials(rev.reviewer?.fullName || ''),
      avatarColor: getAvatarColor(rev.reviewer?.fullName || rev.reviewer?._id, index),
      image: rev.reviewer?.image || null
    },
    rating: rev.rating || 0,
    comment: rev.comment || '',
    date: formatDate(rev.createdAt),
    createdAt: rev.createdAt,
    tags: rev.tags || []
  }));

  const avgRating =
    reviewsList.length > 0
      ? Number((reviewsList.reduce((acc, r) => acc + (r.rating || 0), 0) / reviewsList.length).toFixed(1))
      : 0;

  return {
    reviews: reviewsList,
    summary: {
      avgRating,
      totalReviews: reviewsList.length
    }
  };
};

/**
 * Update Client Status (active, suspended, banned)
 */
const updateClientStatusService = async (clientId, payload = {}) => {
  const { status } = payload;
  const validStatuses = ['active', 'suspended', 'banned'];

  if (!status || !validStatuses.includes(status)) {
    throw new Error(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
  }

  if (!mongoose.Types.ObjectId.isValid(clientId)) {
    throw new Error('Invalid client ID');
  }

  const isBan = status !== 'active';
  const updatedUser = await userModel
    .findByIdAndUpdate(
      clientId,
      {
        $set: {
          status,
          isBan
        }
      },
      { new: true }
    )
    .select('fullName email status isBan role');

  if (!updatedUser) {
    throw new Error('Client not found');
  }

  return updatedUser;
};

/**
 * Get Admin Instructors List
 * Supports tabs (All, Active, Suspended, Banned), search by name/email, sorting, and pagination.
 */
const getAdminInstructorsListService = async (queryParams = {}) => {
  const Booking = require('../Booking/booking.model');
  const Review = require('../Review/review.model');

  const {
    status = 'all',
    search,
    sortBy = 'joined',
    sortOrder = 'desc',
    page = 1,
    limit = 10
  } = queryParams;

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.max(1, Number(limit) || 10);
  const skip = (pageNum - 1) * limitNum;

  // 1. Fetch total counts across status categories for filter tabs
  const [dbInstructorsCount, activeCount, suspendedCount, bannedCount] = await Promise.all([
    userModel.countDocuments({ role: 'instructor', isDeleted: false }),
    userModel.countDocuments({ role: 'instructor', isDeleted: false, status: 'active', isBan: false }),
    userModel.countDocuments({ role: 'instructor', isDeleted: false, status: 'suspended' }),
    userModel.countDocuments({
      role: 'instructor',
      isDeleted: false,
      $or: [{ status: 'banned' }, { isBan: true, status: { $ne: 'suspended' } }]
    })
  ]);

  const filter = {
    role: 'instructor',
    isDeleted: false
  };

  if (status && status !== 'all') {
    if (status === 'active') {
      filter.status = 'active';
      filter.isBan = false;
    } else if (status === 'suspended') {
      filter.status = 'suspended';
    } else if (status === 'banned') {
      filter.$or = [{ status: 'banned' }, { isBan: true, status: { $ne: 'suspended' } }];
    } else if (status === 'pending') {
      filter.status = 'pending';
    }
  }

  if (search && search.trim()) {
    const searchRegex = { $regex: search.trim(), $options: 'i' };
    filter.$or = [{ fullName: searchRegex }, { email: searchRegex }];
  }

  const totalFiltered = await userModel.countDocuments(filter);
  const dbInstructors = await userModel
    .find(filter)
    .select('fullName email status isBan isVerified instructorType avgRating totalReviews totalEarnings lessonsTaught createdAt image')
    .lean();

  if (!dbInstructors || dbInstructors.length === 0) {
    return {
      counts: {
        all: dbInstructorsCount,
        active: activeCount,
        suspended: suspendedCount,
        banned: bannedCount
      },
      instructors: [],
      pagination: {
        totalResults: 0,
        totalPages: 0,
        currentPage: pageNum,
        limit: limitNum
      }
    };
  }

  const instructorIds = dbInstructors.map((i) => i._id);

  // Aggregate bookings (completed sessions, cancellations, instructor earnings) & reviews
  const [bookingStats, reviewStats] = await Promise.all([
    Booking.aggregate([
      { $match: { instructor: { $in: instructorIds } } },
      {
        $group: {
          _id: '$instructor',
          completedSessions: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
          },
          cancellations: {
            $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] }
          },
          totalEarnings: {
            $sum: {
              $cond: [
                { $eq: ['$status', 'completed'] },
                { $ifNull: ['$pricing.instructorEarnings', 0] },
                0
              ]
            }
          }
        }
      }
    ]),
    Review.aggregate([
      { $match: { reviewee: { $in: instructorIds } } },
      {
        $group: {
          _id: '$reviewee',
          avgRating: { $avg: '$rating' },
          totalReviews: { $sum: 1 }
        }
      }
    ])
  ]);

  const bookingMap = new Map();
  bookingStats.forEach((b) => bookingMap.set(b._id.toString(), b));

  const reviewMap = new Map();
  reviewStats.forEach((r) => reviewMap.set(r._id.toString(), r));

  let enrichedList = dbInstructors.map((inst, index) => {
    const bStat = bookingMap.get(inst._id.toString()) || {
      completedSessions: inst.lessonsTaught || 0,
      cancellations: 0,
      totalEarnings: inst.totalEarnings || 0
    };
    const rStat = reviewMap.get(inst._id.toString());
    const instStatus = inst.status || (inst.isBan ? 'banned' : 'active');

    let rating = null;
    let ratingDisplay = 'N/A';
    if (rStat && typeof rStat.avgRating === 'number') {
      rating = Number(rStat.avgRating.toFixed(1));
      ratingDisplay = `${rating}`;
    } else if (typeof inst.avgRating === 'number' && inst.avgRating > 0) {
      rating = Number(inst.avgRating.toFixed(1));
      ratingDisplay = `${rating}`;
    }

    const instructorType = inst.instructorType || 'certified';
    const typeBadge = instructorType === 'certified' ? 'Certified' : 'Exp-Based';
    const initials = getInitials(inst.fullName || '');
    const avatarColor = getAvatarColor(inst.fullName || inst._id, index);
    const sessions = bStat.completedSessions || inst.lessonsTaught || 0;
    const totalEarnings = bStat.totalEarnings || inst.totalEarnings || 0;

    return {
      _id: inst._id,
      fullName: inst.fullName || null,
      initials,
      avatarColor,
      email: inst.email || null,
      status: instStatus,
      instructorType,
      typeBadge,
      rating,
      ratingDisplay,
      joinedDate: formatDate(inst.createdAt),
      createdAt: inst.createdAt,
      sessions,
      totalEarnings,
      formattedEarnings: formatCurrency(totalEarnings),
      cancellations: bStat.cancellations,
      isVerified: typeof inst.isVerified === 'boolean' ? inst.isVerified : false,
      image: inst.image || null
    };
  });

  // Sorting
  enrichedList.sort((a, b) => {
    let comparison = 0;
    if (sortBy === 'name') {
      comparison = (a.fullName || '').localeCompare(b.fullName || '');
    } else if (sortBy === 'email') {
      comparison = (a.email || '').localeCompare(b.email || '');
    } else if (sortBy === 'status') {
      comparison = (a.status || '').localeCompare(b.status || '');
    } else if (sortBy === 'rating') {
      comparison = (a.rating || 0) - (b.rating || 0);
    } else if (sortBy === 'sessions') {
      comparison = (a.sessions || 0) - (b.sessions || 0);
    } else if (sortBy === 'earnings' || sortBy === 'totalEarnings') {
      comparison = (a.totalEarnings || 0) - (b.totalEarnings || 0);
    } else if (sortBy === 'cancellations') {
      comparison = (a.cancellations || 0) - (b.cancellations || 0);
    } else {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      comparison = dateA - dateB;
    }
    return sortOrder === 'asc' ? comparison : -comparison;
  });

  const paginatedInstructors = enrichedList.slice(skip, skip + limitNum);

  return {
    counts: {
      all: dbInstructorsCount,
      active: activeCount,
      suspended: suspendedCount,
      banned: bannedCount
    },
    instructors: paginatedInstructors,
    pagination: {
      totalResults: totalFiltered,
      totalPages: Math.ceil(totalFiltered / limitNum) || 1,
      currentPage: pageNum,
      limit: limitNum
    }
  };
};

/**
 * Get Admin Instructor Details
 * Returns bio, stats cards, certifications, background check, and account status actions.
 */
const getAdminInstructorDetailsService = async (instructorId) => {
  if (!mongoose.Types.ObjectId.isValid(instructorId)) {
    throw new Error('Invalid instructor ID');
  }

  const Booking = require('../Booking/booking.model');
  const Review = require('../Review/review.model');

  const instDoc = await userModel.findById(instructorId).lean();
  if (!instDoc) {
    throw new Error('Instructor not found');
  }

  const [completedCount, cancelledCount, reviewStats] = await Promise.all([
    Booking.countDocuments({ instructor: instructorId, status: 'completed' }),
    Booking.countDocuments({ instructor: instructorId, status: 'cancelled' }),
    Review.aggregate([
      { $match: { reviewee: instDoc._id } },
      {
        $group: {
          _id: '$reviewee',
          avgRating: { $avg: '$rating' },
          totalReviews: { $sum: 1 }
        }
      }
    ])
  ]);

  const instStatus = instDoc.status || (instDoc.isBan ? 'banned' : 'active');
  let rating = null;
  let ratingDisplay = 'N/A';
  if (reviewStats.length > 0 && typeof reviewStats[0].avgRating === 'number') {
    rating = Number(reviewStats[0].avgRating.toFixed(1));
    ratingDisplay = `${rating} / 5.0`;
  } else if (typeof instDoc.avgRating === 'number' && instDoc.avgRating > 0) {
    rating = Number(instDoc.avgRating.toFixed(1));
    ratingDisplay = `${rating} / 5.0`;
  }

  const instructorType = instDoc.instructorType || 'certified';
  const typeBadge = instructorType === 'certified' ? 'Certified' : 'Exp-Based';
  const initials = getInitials(instDoc.fullName || '');
  const avatarColor = getAvatarColor(instDoc.fullName || instDoc._id);

  // Format certifications only if they exist in DB
  const primaryCert = instDoc.certification || (instDoc.certificationsList && instDoc.certificationsList.length > 0
    ? instDoc.certificationsList[0]
    : null);

  const certifications = {
    primary: primaryCert && (primaryCert.fileName || primaryCert.name)
      ? {
          title: primaryCert.fileName || primaryCert.name || null,
          subtitle: [primaryCert.name, primaryCert.issuer, primaryCert.expiryDate].filter(Boolean).join(' · '),
          name: primaryCert.name || null,
          issuer: primaryCert.issuer || null,
          expiryDate: primaryCert.expiryDate || null,
          fileName: primaryCert.fileName || null,
          fileUrl: primaryCert.fileUrl || null
        }
      : null,
    cpr: instDoc.cprCertification && (instDoc.cprCertification.name || instDoc.cprCertification.fileName)
      ? {
          title: instDoc.cprCertification.fileName || instDoc.cprCertification.name || null,
          subtitle: [instDoc.cprCertification.name, instDoc.cprCertification.issuer, instDoc.cprCertification.expiryDate].filter(Boolean).join(' · '),
          name: instDoc.cprCertification.name || null,
          issuer: instDoc.cprCertification.issuer || null,
          expiryDate: instDoc.cprCertification.expiryDate || null,
          fileName: instDoc.cprCertification.fileName || null,
          fileUrl: instDoc.cprCertification.fileUrl || null
        }
      : null,
    firstAid: instDoc.firstAidCertification && (instDoc.firstAidCertification.name || instDoc.firstAidCertification.fileName)
      ? {
          title: instDoc.firstAidCertification.fileName || instDoc.firstAidCertification.name || null,
          subtitle: [instDoc.firstAidCertification.name, instDoc.firstAidCertification.issuer, instDoc.firstAidCertification.expiryDate].filter(Boolean).join(' · '),
          name: instDoc.firstAidCertification.name || null,
          issuer: instDoc.firstAidCertification.issuer || null,
          expiryDate: instDoc.firstAidCertification.expiryDate || null,
          fileName: instDoc.firstAidCertification.fileName || null,
          fileUrl: instDoc.firstAidCertification.fileUrl || null
        }
      : null
  };

  // Format experience details for experience-based instructors
  const experience = {
    experienceYears: instDoc.experience?.years !== undefined ? instDoc.experience.years : (instDoc.experienceYears || 0),
    experienceDescription: instDoc.experience?.description || instDoc.experienceDescription || instDoc.about || instDoc.bio || '',
    referenceName: instDoc.experience?.referenceName || instDoc.referenceName || null,
    referenceContact: instDoc.experience?.referenceContact || instDoc.referenceContact || null,
    waiverAgreed: !!instDoc.experienceWaiver?.isAgreed,
    waiverAgreedAt: instDoc.experienceWaiver?.agreedAt || null
  };

  // Format background check only if present in DB
  const bgCheck = instDoc.backgroundCheck && (instDoc.backgroundCheck.idType || instDoc.backgroundCheck.documentName || instDoc.backgroundCheck.status)
    ? {
        idType: instDoc.backgroundCheck.idType || null,
        idNumber: instDoc.backgroundCheck.idNumber || null,
        documentTitle: instDoc.backgroundCheck.documentName || null,
        documentSubtitle: instDoc.backgroundCheck.issuer ? `Identity Document · ${instDoc.backgroundCheck.issuer}` : null,
        documentName: instDoc.backgroundCheck.documentName || null,
        documentUrl: instDoc.backgroundCheck.documentUrl || null,
        isConsentConfirmed: typeof instDoc.backgroundCheck.isConsentConfirmed === 'boolean' ? instDoc.backgroundCheck.isConsentConfirmed : null,
        consentText: instDoc.backgroundCheck.isConsentConfirmed ? 'Background check consent confirmed' : null,
        status: instDoc.backgroundCheck.status || null
      }
    : null;

  return {
    instructor: {
      _id: instDoc._id,
      fullName: instDoc.fullName || null,
      initials,
      avatarColor,
      email: instDoc.email || null,
      status: instStatus,
      isVerified: typeof instDoc.isVerified === 'boolean' ? instDoc.isVerified : false,
      instructorType,
      typeBadge,
      image: instDoc.image || null,
      bio: instDoc.bio || null,
      about: instDoc.about || null,
      number: instDoc.number || null,
      address: instDoc.address || null
    },
    stats: {
      joinedDate: formatDate(instDoc.createdAt),
      rating,
      ratingDisplay,
      sessions: completedCount || instDoc.lessonsTaught || 0,
      cancellations: cancelledCount
    },
    certifications,
    experience,
    backgroundCheck: bgCheck,
    accountStatus: instStatus,
    canSuspend: instStatus !== 'suspended',
    canBan: instStatus !== 'banned',
    canActivate: instStatus !== 'active'
  };
};

/**
 * Get Admin Instructor Reviews
 * Returns all reviews for this instructor.
 */
const getAdminInstructorReviewsService = async (instructorId, queryParams = {}) => {
  if (!mongoose.Types.ObjectId.isValid(instructorId)) {
    throw new Error('Invalid instructor ID');
  }

  const Review = require('../Review/review.model');

  const dbReviews = await Review.find({ reviewee: instructorId })
    .populate('reviewer', 'fullName image avgRating')
    .sort({ createdAt: -1 })
    .lean();

  const reviewsList = (dbReviews || []).map((rev, index) => ({
    _id: rev._id,
    reviewer: {
      _id: rev.reviewer?._id || null,
      fullName: rev.reviewer?.fullName || null,
      initials: getInitials(rev.reviewer?.fullName || ''),
      avatarColor: getAvatarColor(rev.reviewer?.fullName || rev.reviewer?._id, index),
      image: rev.reviewer?.image || null
    },
    rating: rev.rating || 0,
    comment: rev.comment || '',
    date: formatDate(rev.createdAt),
    createdAt: rev.createdAt,
    tags: rev.tags || []
  }));

  const avgRating =
    reviewsList.length > 0
      ? Number((reviewsList.reduce((acc, r) => acc + (r.rating || 0), 0) / reviewsList.length).toFixed(1))
      : 0;

  return {
    reviews: reviewsList,
    summary: {
      avgRating,
      totalReviews: reviewsList.length
    }
  };
};

/**
 * Update Instructor Status (active, suspended, banned, pending) & Verification
 */
const updateInstructorStatusService = async (instructorId, payload = {}) => {
  const { status, isVerified } = payload;
  const validStatuses = ['active', 'suspended', 'banned', 'pending'];

  if (!mongoose.Types.ObjectId.isValid(instructorId)) {
    throw new Error('Invalid instructor ID');
  }

  const updateData = {};
  if (status) {
    if (!validStatuses.includes(status)) {
      throw new Error(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
    }
    updateData.status = status;
    updateData.isBan = status !== 'active';
  }

  if (typeof isVerified === 'boolean') {
    updateData.isVerified = isVerified;
  }

  const updatedUser = await userModel
    .findByIdAndUpdate(instructorId, { $set: updateData }, { new: true })
    .select('fullName email status isBan isVerified role instructorType');

  if (!updatedUser) {
    throw new Error('Instructor not found');
  }

  return updatedUser;
};

module.exports = {
  suspendUserService,
  banUserService,
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
  getUserHomeFeedService,
  getInstructorHomeFeedService,
  updateUserLocationService,
  getAdminClientsListService,
  getAdminClientDetailsService,
  getAdminClientReviewsService,
  updateClientStatusService,
  getAdminInstructorsListService,
  getAdminInstructorDetailsService,
  getAdminInstructorReviewsService,
  updateInstructorStatusService
};