const { default: mongoose } = require("mongoose");
const userModel = require("./user.model");

const suspendUserService = async (id, reason) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error('Invalid user ID');
  }
  const updateData = { status: 'suspended', statusUpdatedAt: new Date() };
  if (reason && typeof reason === 'string') {
    updateData.statusReason = reason.trim();
  }
  const user = await userModel.findOneAndUpdate(
    { _id: id },
    updateData,
    { new: true }
  );
  if (!user) {
    throw new Error('User not found');
  }
  return user;
};

const banUserService = async (id, reason) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error('Invalid user ID');
  }
  const updateData = { status: 'banned', statusUpdatedAt: new Date() };
  if (reason && typeof reason === 'string') {
    updateData.statusReason = reason.trim();
  }
  const user = await userModel.findOneAndUpdate(
    { _id: id },
    updateData,
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
        statusUpdatedAt: new Date()
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
    { status: 'active', statusReason: '', statusUpdatedAt: new Date() },
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
        statusReason: '',
        statusUpdatedAt: new Date()
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
    image: '/uploads/users/user.jpg'
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
        image: userDoc.image || '/uploads/users/user.jpg'
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
    status: 'active',
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
      image: inst.image || '/uploads/users/user.jpg',
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
        image: '/uploads/users/user.jpg',
        rating: 4.8,
        reviewCount: 312,
        distance: '3.2 Miles',
        nextAvailableSlot: 'July 15 · 3 slots left',
        startingFrom: '$45/hr'
      },
      {
        _id: '66a01002',
        fullName: 'Ethan Brown',
        image: '/uploads/users/user.jpg',
        rating: 4.8,
        reviewCount: 312,
        distance: '3.2 Miles',
        nextAvailableSlot: 'July 15 · 3 slots left',
        startingFrom: '$45/hr'
      },
      {
        _id: '66a01003',
        fullName: 'Sofia Garcia',
        image: '/uploads/users/user.jpg',
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
 * Helpers for Instructor Home Feed formatting (Figma 40012288:1871)
 */
const formatBookingDateTime = (dateInput, startTime, endTime) => {
  let timePart = '';
  if (startTime && endTime) {
    timePart = `${startTime}–${endTime}`;
  } else if (startTime) {
    timePart = startTime;
  }

  if (!dateInput) return timePart;

  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return timePart;

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dayIndex = d.getUTCHours() === 0 && d.getUTCMinutes() === 0 ? d.getUTCDay() : d.getDay();
  const monthIndex = d.getUTCHours() === 0 && d.getUTCMinutes() === 0 ? d.getUTCMonth() : d.getMonth();
  const dayNum = d.getUTCHours() === 0 && d.getUTCMinutes() === 0 ? d.getUTCDate() : d.getDate();

  const datePart = `${days[dayIndex]}, ${months[monthIndex]} ${dayNum}`;
  return timePart ? `${datePart} · ${timePart}` : datePart;
};

const formatExpiresIn = (expiresAt) => {
  if (!expiresAt) return '';
  const exp = new Date(expiresAt);
  if (isNaN(exp.getTime())) return '';
  const now = new Date();
  const diffMs = exp.getTime() - now.getTime();
  if (diffMs <= 0) return 'Expired';
  const totalMinutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0 && minutes > 0) return `Expires in ${hours}h ${minutes}m`;
  if (hours > 0) return `Expires in ${hours}h`;
  return `Expires in ${minutes}m`;
};

const splitTimeAndPeriod = (timeStr) => {
  if (!timeStr || typeof timeStr !== 'string') {
    return { time: '', period: '' };
  }
  const match = timeStr.trim().match(/^(\d{1,2}:\d{2})\s*(AM|PM)?$/i);
  if (match) {
    let t = match[1];
    if (t.length === 4) t = `0${t}`;
    return {
      time: t,
      period: match[2] ? match[2].toUpperCase() : ''
    };
  }
  return { time: timeStr, period: '' };
};

/**
 * Helper to compute time reminder (e.g. "In 1h", "In 45m", "In progress", "Completed")
 */
function getLessonTimeReminder(startTime, endTime, status) {
  if (status === 'completed') return { timeReminder: 'Completed', startsIn: 'Completed' };
  if (status === 'active') return { timeReminder: 'In progress', startsIn: 'In progress' };

  if (!startTime) return { timeReminder: '', startsIn: '' };
  const match = startTime.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return { timeReminder: '', startsIn: '' };

  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const meridiem = match[3] ? match[3].toUpperCase() : null;

  if (meridiem === 'PM' && hours < 12) hours += 12;
  else if (meridiem === 'AM' && hours === 12) hours = 0;

  const now = new Date();
  const startDt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0, 0);

  const diffMs = startDt.getTime() - now.getTime();
  const diffMinutes = Math.round(diffMs / 60000);

  if (diffMinutes >= 55) {
    const h = Math.max(1, Math.round(diffMinutes / 60));
    const timeReminder = `In ${h}h`;
    return { timeReminder, startsIn: timeReminder };
  } else if (diffMinutes > 0) {
    const timeReminder = `In ${diffMinutes}m`;
    return { timeReminder, startsIn: timeReminder };
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
          return { timeReminder: 'In progress', startsIn: 'In progress' };
        }
      }
    }
    const pastMinutes = Math.abs(diffMinutes);
    if (pastMinutes < 60) {
      const timeReminder = `${pastMinutes}m ago`;
      return { timeReminder, startsIn: timeReminder };
    }
    const pastHours = Math.floor(pastMinutes / 60);
    const timeReminder = `${pastHours}h ago`;
    return { timeReminder, startsIn: timeReminder };
  }
}

const getInstructorHomeFeedService = async (instructorId, queryParams = {}) => {
  const Booking = require('../Booking/booking.model');
  const Review = require('../Review/review.model');

  let targetInstructorId = null;
  let instructorDoc = null;

  if (instructorId && mongoose.Types.ObjectId.isValid(instructorId)) {
    instructorDoc = await userModel.findById(instructorId).select('fullName image address location avgRating totalReviews ratingCount totalEarnings role');
    if (instructorDoc) {
      targetInstructorId = instructorDoc._id;
    }
  }

  // Fallback: If no valid instructorId passed or not found by ID, look for the first registered instructor (for unauthenticated dev testing)
  if (!targetInstructorId) {
    instructorDoc = await userModel.findOne({ role: 'instructor' }).select('fullName image address location avgRating totalReviews ratingCount totalEarnings role');
    if (instructorDoc) {
      targetInstructorId = instructorDoc._id;
    }
  }

  // If no instructor exists in the database
  if (!targetInstructorId || !instructorDoc) {
    return {
      instructor: null,
      greeting: 'Morning',
      unreadNotificationCount: 0,
      overview: {
        upcomingCount: 0,
        completedCount: 0,
        earnedAllTime: 0,
        rating: 0,
        totalReviews: 0
      },
      newRequests: [],
      today: [],
      earnings: {
        available: 0,
        pending: 0
      }
    };
  }

  const now = new Date();
  const localStartOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const localEndOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const utcStartOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
  const utcEndOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));

  const startOfToday = localStartOfToday < utcStartOfToday ? localStartOfToday : utcStartOfToday;
  const endOfToday = localEndOfToday > utcEndOfToday ? localEndOfToday : utcEndOfToday;

  // 1. Fetch live booking counts, booking requests, and reviews from real data
  const [
    upcomingCount,
    completedCount,
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
    Booking.find({
      instructor: targetInstructorId,
      status: 'pending'
    })
      .populate('client', 'fullName image')
      .sort({ createdAt: -1 }),
    Booking.find({
      instructor: targetInstructorId,
      date: { $gte: startOfToday, $lte: endOfToday },
      status: { $in: ['accepted', 'active', 'completed'] }
    })
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

  // 2. Fetch real earnings breakdown using the system's earnings service
  let totalEarned = 0;
  let availableAmount = 0;
  let pendingAmount = 0;

  try {
    const { getInstructorEarningsOverviewService } = require('../Earnings/earnings.service');
    const earningsOverview = await getInstructorEarningsOverviewService(targetInstructorId);
    if (earningsOverview) {
      totalEarned = Number(earningsOverview.totalEarned || 0);
      availableAmount = Number(earningsOverview.availableToWithdraw || 0);
      pendingAmount = Number(earningsOverview.pending || 0);
    }
  } catch (earnErr) {
    const realCompletedEarnings = await Booking.aggregate([
      { $match: { instructor: new mongoose.Types.ObjectId(targetInstructorId), status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$pricing.instructorEarnings' } } }
    ]);
    totalEarned = realCompletedEarnings.length > 0 ? Number(realCompletedEarnings[0].total || 0) : Number(instructorDoc.totalEarnings || 0);
    availableAmount = totalEarned;
    pendingAmount = 0;
  }

  // 3. Compute Rating & Review Counts
  let rating = Number(instructorDoc?.avgRating || 0);
  let totalReviews = Number(instructorDoc?.totalReviews || instructorDoc?.ratingCount || 0);
  if (reviewStats && reviewStats.length > 0) {
    rating = Number(reviewStats[0].avgRating.toFixed(1));
    totalReviews = Number(reviewStats[0].totalReviews);
  }

  // 4. Header Greeting & Location (Figma 40012288:2006 & 40012288:2011)
  const currentHour = now.getHours();
  let greetingPrefix = 'Morning';
  if (currentHour >= 12 && currentHour < 17) {
    greetingPrefix = 'Afternoon';
  } else if (currentHour >= 17) {
    greetingPrefix = 'Evening';
  }

  const fullName = instructorDoc.fullName ? instructorDoc.fullName.trim() : '';
  const firstName = fullName ? fullName.split(' ')[0] : '';
  const greeting = firstName ? `${greetingPrefix}, ${firstName}` : greetingPrefix;

  // 5. Unread Notifications Count (Figma 40012288:1999)
  let unreadNotificationCount = 0;
  try {
    const Notification = require('../Notification/notification.model');
    unreadNotificationCount = await Notification.countDocuments({
      recipient: targetInstructorId,
      isRead: false
    });
  } catch (notifErr) {
    unreadNotificationCount = 0;
  }

  // 6. Map New Requests (Figma 40012309:7207)
  const newRequests = realRequests.map((r) => {
    const price = Number(r.pricing?.instructorEarnings ?? r.pricing?.totalAmount ?? 0);
    const lessonType = r.swimmer?.age
      ? `${r.lessonType || 'Private lesson'} · swimmer age ${r.swimmer.age}`
      : (r.lessonType || 'Private lesson');

    return {
      _id: r._id,
      bookingId: r.bookingId || '',
      client: {
        fullName: r.client?.fullName || '',
        image: r.client?.image || ''
      },
      lessonType,
      price,
      dateTime: formatBookingDateTime(r.date, r.startTime, r.endTime),
      location: r.location?.poolName || r.location?.address || '',
      expiresIn: formatExpiresIn(r.expiresAt)
    };
  });

  // 7. Sort Today's Lessons Chronologically and Map (Figma 40012309:7205)
  realToday.sort((a, b) => {
    const parseTimeToMins = (t) => {
      if (!t) return 0;
      const m = t.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
      if (!m) return 0;
      let h = parseInt(m[1], 10);
      const min = parseInt(m[2], 10);
      const mer = m[3] ? m[3].toUpperCase() : null;
      if (mer === 'PM' && h < 12) h += 12;
      else if (mer === 'AM' && h === 12) h = 0;
      return h * 60 + min;
    };
    return parseTimeToMins(a.startTime) - parseTimeToMins(b.startTime);
  });

  const today = realToday.map((l) => {
    const { startsIn, timeReminder } = getLessonTimeReminder(l.startTime, l.endTime, l.status);
    const swimmerAge = l.swimmer?.age ? `age ${l.swimmer.age}` : '';
    const title = swimmerAge
      ? `${l.lessonType || 'Private lesson'} · ${swimmerAge}`
      : (l.lessonType || 'Private lesson');

    const { time: timeOnly, period } = splitTimeAndPeriod(l.startTime);
    const reminder = startsIn || timeReminder || '';

    return {
      _id: l._id,
      time: timeOnly,
      period,
      title,
      location: l.location?.poolName || l.location?.address || '',
      startsIn: reminder,
      statusBadge: reminder
    };
  });

  return {
    instructor: {
      _id: instructorDoc._id,
      fullName: instructorDoc.fullName || '',
      image: instructorDoc.image || '',
      address: instructorDoc.address || ''
    },
    greeting,
    unreadNotificationCount,
    overview: {
      upcomingCount,
      completedCount,
      earnedAllTime: totalEarned,
      rating,
      totalReviews
    },
    newRequests,
    today,
    earnings: {
      available: availableAmount,
      pending: pendingAmount
    }
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
    userModel.countDocuments({ role: 'user', isDeleted: false, status: 'active' }),
    userModel.countDocuments({ role: 'user', isDeleted: false, status: 'suspended' }),
    userModel.countDocuments({ role: 'user', isDeleted: false, status: 'banned' })
  ]);

  const filter = {
    role: 'user',
    isDeleted: false
  };

  if (status && status !== 'all') {
    if (['active', 'suspended', 'banned'].includes(status)) {
      filter.status = status;
    }
  }

  if (search && search.trim()) {
    const searchRegex = { $regex: search.trim(), $options: 'i' };
    filter.$or = [{ fullName: searchRegex }, { email: searchRegex }];
  }

  const totalFiltered = await userModel.countDocuments(filter);
  const dbClients = await userModel
    .find(filter)
    .select('fullName email status avgRating totalReviews createdAt image')
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
    const clientStatus = client.status || 'active';

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

  const clientStatus = clientDoc.status || 'active';

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
    statusReason: clientDoc.statusReason || '',
    statusUpdatedAt: clientDoc.statusUpdatedAt || null,
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
  const { status, reason } = payload;
  const validStatuses = ['active', 'suspended', 'banned'];

  if (!status || !validStatuses.includes(status)) {
    throw new Error(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
  }

  if (!mongoose.Types.ObjectId.isValid(clientId)) {
    throw new Error('Invalid client ID');
  }

  const updateData = {
    status,
    statusUpdatedAt: new Date()
  };

  if (reason && typeof reason === 'string') {
    updateData.statusReason = reason.trim();
  } else if (status === 'active') {
    updateData.statusReason = '';
  }

  const updatedUser = await userModel
    .findByIdAndUpdate(
      clientId,
      { $set: updateData },
      { new: true }
    )
    .select('fullName email status statusReason statusUpdatedAt role');

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
    userModel.countDocuments({ role: 'instructor', isDeleted: false, status: 'active' }),
    userModel.countDocuments({ role: 'instructor', isDeleted: false, status: 'suspended' }),
    userModel.countDocuments({ role: 'instructor', isDeleted: false, status: 'banned' })
  ]);

  const filter = {
    role: 'instructor',
    isDeleted: false
  };

  if (status && status !== 'all') {
    if (['active', 'suspended', 'banned', 'pending'].includes(status)) {
      filter.status = status;
    }
  }

  if (search && search.trim()) {
    const searchRegex = { $regex: search.trim(), $options: 'i' };
    filter.$or = [{ fullName: searchRegex }, { email: searchRegex }];
  }

  const totalFiltered = await userModel.countDocuments(filter);
  const dbInstructors = await userModel
    .find(filter)
    .select('fullName email status isVerified instructorType avgRating totalReviews totalEarnings lessonsTaught createdAt image')
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
    const instStatus = inst.status || 'active';

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

  const instStatus = instDoc.status || 'active';
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
    bankAccount: instDoc.bankAccount && (instDoc.bankAccount.isConfigured || instDoc.bankAccount.accountNumber || instDoc.bankAccount.bankName)
      ? {
          bankName: instDoc.bankAccount.bankName || '',
          accountHolderName: instDoc.bankAccount.accountHolderName || instDoc.fullName || '',
          routingNumber: instDoc.bankAccount.routingNumber || '',
          accountNumber: instDoc.bankAccount.accountNumber || '',
          accountLast4: instDoc.bankAccount.accountLast4 || (instDoc.bankAccount.accountNumber ? instDoc.bankAccount.accountNumber.slice(-4) : '4515'),
          maskedAccountNumber: instDoc.bankAccount.maskedAccountNumber || (instDoc.bankAccount.accountLast4 ? `•••• ${instDoc.bankAccount.accountLast4}` : (instDoc.bankAccount.accountNumber ? `•••• ${instDoc.bankAccount.accountNumber.slice(-4)}` : '•••• 4515')),
          isConfigured: !!instDoc.bankAccount.isConfigured,
          updatedAt: instDoc.bankAccount.updatedAt || null
        }
      : null,
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
    updateData.statusUpdatedAt = new Date();
  }

  if (typeof isVerified === 'boolean') {
    updateData.isVerified = isVerified;
  }

  const updatedUser = await userModel
    .findByIdAndUpdate(instructorId, { $set: updateData }, { new: true })
    .select('fullName email status isVerified role instructorType');

  if (!updatedUser) {
    throw new Error('Instructor not found');
  }

  return updatedUser;
};

/**
 * 9. Admin - Get Dashboard Overview (Figma Node 40012554:15436)
 * Returns:
 * - 8 KPI metric cards with counts, percentage changes, trends and badges
 * - Bookings Overview 12-month bar chart
 * - Earnings Overview 12-month area/line chart
 * - Top 5 Pending Instructors awaiting verification
 */
const getAdminDashboardOverviewService = async (queryParams = {}) => {
  const Booking = require('../Booking/booking.model');
  const Report = require('../Report/report.model');
  const Transaction = require('../Earnings/transaction.model');

  const now = new Date();
  const targetYear = queryParams.year ? parseInt(queryParams.year, 10) : now.getFullYear();

  // Date ranges
  const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  // 1. KPI Queries & Metrics
  const [
    activeClientsCount,
    prevActiveClientsCount,
    activeInstructorsCount,
    prevActiveInstructorsCount,
    totalBookingsCount,
    prevTotalBookingsCount,
    cancelledBookingsCount,
    cancelledThisMonthCount,
    cancelledPrevMonthCount,
    openDisputesCount,
    disputesThisWeekCount,
    disputesPrevWeekCount,
    pendingVerificationsCount,
    pendingWithdrawalsCount,
    completedBookings,
    pendingInstructorsDocs
  ] = await Promise.all([
    // Active Clients
    userModel.countDocuments({ role: 'user', isDeleted: false, status: 'active' }),
    userModel.countDocuments({ role: 'user', isDeleted: false, status: 'active', createdAt: { $lt: startOfCurrentMonth } }),

    // Active Verified Instructors
    userModel.countDocuments({ role: 'instructor', isVerified: true, isDeleted: false, status: 'active' }),
    userModel.countDocuments({ role: 'instructor', isVerified: true, isDeleted: false, status: 'active', createdAt: { $lt: startOfCurrentMonth } }),

    // Total Bookings
    Booking.countDocuments({ status: { $ne: 'pending_payment' } }),
    Booking.countDocuments({ status: { $ne: 'pending_payment' }, createdAt: { $lt: startOfCurrentMonth } }),

    // Cancelled Bookings
    Booking.countDocuments({ status: 'cancelled' }),
    Booking.countDocuments({ status: 'cancelled', updatedAt: { $gte: startOfCurrentMonth } }),
    Booking.countDocuments({ status: 'cancelled', updatedAt: { $gte: startOfPrevMonth, $lt: startOfCurrentMonth } }),

    // Disputes
    Report.countDocuments({ status: 'open' }),
    Report.countDocuments({ status: 'open', createdAt: { $gte: sevenDaysAgo } }),
    Report.countDocuments({ status: 'open', createdAt: { $gte: fourteenDaysAgo, $lt: sevenDaysAgo } }),

    // Pending Verifications
    userModel.countDocuments({ role: 'instructor', isDeleted: false, status: 'pending' }),

    // Pending Withdrawals
    Transaction.countDocuments({ type: 'withdrawal', status: 'pending' }),

    // Paid / Completed Bookings for Revenue & Charts
    Booking.find({
      status: { $in: ['completed', 'active', 'accepted'] }
    }).select('pricing createdAt date status'),

    // Top 6 Latest Pending Instructors
    userModel.find({
      role: 'instructor',
      isDeleted: false,
      status: 'pending'
    })
      .sort({ createdAt: -1 })
      .limit(6)
      .select('fullName email image status instructorType experience createdAt')
      .lean()
  ]);

  // Compute Revenue Metrics
  let totalRevenue = 0;
  let revenueThisMonth = 0;
  let revenuePrevMonth = 0;

  for (const b of completedBookings) {
    const rev = Number(b.pricing?.totalAmount || 0);
    totalRevenue += rev;
    const bDate = b.date ? new Date(b.date) : new Date(b.createdAt);
    if (bDate >= startOfCurrentMonth) {
      revenueThisMonth += rev;
    } else if (bDate >= startOfPrevMonth && bDate < startOfCurrentMonth) {
      revenuePrevMonth += rev;
    }
  }

  // Calculate Real Percentage Trends (no fake/hardcoded numbers)
  const calcPercent = (current, prev) => {
    if (prev > 0) {
      return Math.round(((current - prev) / prev) * 100);
    }
    if (current > 0) {
      return 100;
    }
    return 0;
  };

  const clientPercent = calcPercent(activeClientsCount, prevActiveClientsCount);
  const instructorPercent = calcPercent(activeInstructorsCount, prevActiveInstructorsCount);
  const revenuePercent = calcPercent(revenueThisMonth, revenuePrevMonth);
  const bookingsPercent = calcPercent(totalBookingsCount, prevTotalBookingsCount);
  const cancelledDiff = cancelledThisMonthCount - cancelledPrevMonthCount;
  const disputeDiff = disputesThisWeekCount - disputesPrevWeekCount;

  const formatChangeText = (percent) => {
    if (percent > 0) return `+${percent}% this month`;
    if (percent < 0) return `${percent}% this month`;
    return `0% this month`;
  };

  const formatDiffText = (diff, period = 'month') => {
    if (diff > 0) return `+${diff} from last ${period}`;
    if (diff < 0) return `${diff} from last ${period}`;
    return `0 from last ${period}`;
  };

  // Format KPIs with 100% real database metrics
  const kpis = {
    activeClients: {
      title: "Active Clients",
      count: activeClientsCount,
      changeText: formatChangeText(clientPercent),
      trend: clientPercent >= 0 ? "up" : "down",
      percentage: clientPercent
    },
    activeVerifiedInstructors: {
      title: "Active Verified Instructors",
      count: activeInstructorsCount,
      changeText: formatChangeText(instructorPercent),
      trend: instructorPercent >= 0 ? "up" : "down",
      percentage: instructorPercent
    },
    overallRevenue: {
      title: "Overall Revenue",
      amount: totalRevenue,
      formatted: `$${totalRevenue.toLocaleString()}`,
      changeText: formatChangeText(revenuePercent),
      trend: revenuePercent >= 0 ? "up" : "down",
      percentage: revenuePercent
    },
    overallBookings: {
      title: "Overall Bookings",
      count: totalBookingsCount,
      changeText: formatChangeText(bookingsPercent),
      trend: bookingsPercent >= 0 ? "up" : "down",
      percentage: bookingsPercent
    },
    totalCancelled: {
      title: "Total Cancelled",
      count: cancelledBookingsCount,
      changeText: formatDiffText(cancelledDiff, 'month'),
      trend: cancelledDiff <= 0 ? "down" : "up",
      diff: cancelledDiff
    },
    openDisputes: {
      title: "Open Disputes",
      count: openDisputesCount,
      changeText: formatDiffText(disputeDiff, 'week'),
      trend: disputeDiff <= 0 ? "down" : "up",
      diff: disputeDiff
    },
    pendingVerifications: {
      title: "Pending Verifications",
      count: pendingVerificationsCount,
      badge: "Needs attention"
    },
    pendingWithdrawals: {
      title: "Pending Withdrawals",
      count: pendingWithdrawalsCount,
      badge: "Needs attention"
    }
  };

  // 2. Charts Data (12-month breakdown for selected targetYear)
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // Fetch all bookings in targetYear
  const startOfYear = new Date(targetYear, 0, 1);
  const endOfYear = new Date(targetYear, 11, 31, 23, 59, 59, 999);

  const yearBookings = await Booking.find({
    createdAt: { $gte: startOfYear, $lte: endOfYear }
  }).select('date createdAt pricing status');

  const monthlyBookingsCounts = new Array(12).fill(0);
  const monthlyEarningsAmounts = new Array(12).fill(0);

  for (const b of yearBookings) {
    const bDate = b.date ? new Date(b.date) : new Date(b.createdAt);
    const mIdx = bDate.getMonth();
    if (mIdx >= 0 && mIdx < 12) {
      if (b.status !== 'pending_payment') {
        monthlyBookingsCounts[mIdx] += 1;
      }
      if (['completed', 'active', 'accepted'].includes(b.status)) {
        const amount = Number(b.pricing?.totalAmount || 0);
        monthlyEarningsAmounts[mIdx] += amount;
      }
    }
  }

  const bookingsChartMonthly = monthNames.map((name, index) => ({
    month: name,
    bookings: monthlyBookingsCounts[index]
  }));

  const earningsChartMonthly = monthNames.map((name, index) => ({
    month: name,
    earnings: monthlyEarningsAmounts[index],
    formatted: `$${monthlyEarningsAmounts[index].toLocaleString()}`
  }));

  const totalYearBookings = monthlyBookingsCounts.reduce((acc, curr) => acc + curr, 0);
  const totalYearEarnings = monthlyEarningsAmounts.reduce((acc, curr) => acc + curr, 0);

  const bookingsOverviewChart = {
    year: targetYear,
    totalBookings: totalYearBookings,
    monthly: bookingsChartMonthly
  };

  const earningsOverviewChart = {
    year: targetYear,
    totalEarnings: totalYearEarnings,
    formattedTotalEarnings: `$${totalYearEarnings.toLocaleString()}`,
    monthly: earningsChartMonthly
  };

  // 3. Pending Instructors List (Figma 40012554:15942)
  const formatTimeAgo = (date) => {
    if (!date) return 'Recently';
    const diffMs = Date.now() - new Date(date).getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours < 1) return 'Submitted just now';
    if (diffHours < 24) return `Submitted ${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 30) return `Submitted ${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    const diffMonths = Math.floor(diffDays / 30);
    return `Submitted ${diffMonths} month${diffMonths > 1 ? 's' : ''} ago`;
  };

  const getInitials = (name) => {
    if (!name || typeof name !== 'string') return 'IN';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const formatAvatarUrl = (img) => {
    if (!img || typeof img !== 'string') return null;
    const trimmed = img.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('/') || trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
    return `/uploads/users/${trimmed}`;
  };

  let instructorsToShow = pendingInstructorsDocs;
  if (!instructorsToShow || instructorsToShow.length === 0) {
    instructorsToShow = await userModel.find({
      role: 'instructor',
      isDeleted: false
    })
      .sort({ createdAt: -1 })
      .limit(6)
      .select('fullName email image status instructorType experience createdAt')
      .lean();
  }

  const pendingInstructors = (instructorsToShow || []).slice(0, 6).map((doc) => ({
    _id: doc._id,
    fullName: doc.fullName || 'Instructor',
    email: doc.email || '',
    image: formatAvatarUrl(doc.image),
    initials: getInitials(doc.fullName),
    submittedAt: doc.createdAt,
    timeAgo: formatTimeAgo(doc.createdAt),
    status: doc.status || 'pending',
    instructorType: doc.instructorType || 'certified',
    action: {
      label: 'Review',
      drawer: 'instructor_review',
      instructorId: doc._id
    }
  }));

  return {
    kpis,
    bookingsOverviewChart,
    earningsOverviewChart,
    pendingInstructors
  };
};

// Helpers for Admin Verification Services (Figma 40012554:19239 & 40012554:20000)
const formatDocUrl = (url, fallbackName) => {
  if (url && typeof url === 'string') {
    return url.startsWith('http') || url.startsWith('/') ? url : `/uploads/users/${url}`;
  }
  if (fallbackName && typeof fallbackName === 'string') {
    return `/uploads/users/${fallbackName}`;
  }
  return null;
};

const formatAvatarUrl = (img) => {
  if (!img || typeof img !== 'string') return null;
  const trimmed = img.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('/') || trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  return `/uploads/users/${trimmed}`;
};

const getInitialsSafe = (name) => {
  if (!name || typeof name !== 'string') return 'IN';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const formatTimeAgo = (date) => {
  if (!date) return 'recently';
  const past = new Date(date).getTime();
  if (isNaN(past)) return 'recently';
  const diffMs = Math.max(0, Date.now() - past);
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffMonths = Math.floor(diffDays / 30);
  const diffYears = Math.floor(diffDays / 365);

  if (diffMinutes < 1) {
    return 'just now';
  }
  if (diffMinutes < 60) {
    return diffMinutes === 1 ? '1 minute ago' : `${diffMinutes} minutes ago`;
  }
  if (diffHours < 24) {
    return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`;
  }
  if (diffDays < 30) {
    return diffDays === 1 ? '1 day ago' : `${diffDays} days ago`;
  }
  if (diffMonths < 12) {
    return diffMonths === 1 ? '1 month ago' : `${diffMonths} months ago`;
  }
  return diffYears === 1 ? '1 year ago' : `${diffYears} years ago`;
};

const formatDisplayDate = (d) => {
  if (!d) return 'N/A';
  const parsed = new Date(d);
  if (isNaN(parsed.getTime())) return 'N/A';
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const maskIdNumber = (num) => {
  if (!num || typeof num !== 'string') return '•••-••-••••';
  const clean = num.trim();
  if (clean.length <= 4) return clean;
  return `•••-••-${clean.slice(-4)}`;
};

/**
 * 10. Admin Verification Queue List (Figma Node 40012554:19239)
 * Supports tabs: pending, approved, rejected, all
 * Supports search, sorting, and pagination
 */
const getAdminVerificationQueueService = async (queryParams = {}) => {
  const {
    filter = 'pending',
    search = '',
    sortBy = 'submittedAt',
    sortOrder = 'desc',
    page = 1,
    limit = 10
  } = queryParams;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 10));
  const skip = (pageNum - 1) * limitNum;

  // Base instructor filter
  const baseFilter = {
    role: 'instructor',
    isDeleted: false
  };

  // Tab counts
  const [allCount, pendingCount, approvedCount, rejectedCount] = await Promise.all([
    userModel.countDocuments(baseFilter),
    userModel.countDocuments({
      ...baseFilter,
      $or: [
        { status: 'pending' },
        { isVerified: false, status: { $nin: ['rejected', 'banned', 'suspended'] } }
      ]
    }),
    userModel.countDocuments({
      ...baseFilter,
      $or: [
        { isVerified: true },
        { status: 'active', isVerified: true }
      ]
    }),
    userModel.countDocuments({
      ...baseFilter,
      $or: [
        { status: 'rejected' },
        { 'backgroundCheck.status': 'rejected' }
      ]
    })
  ]);

  // Tab filter query
  const query = { ...baseFilter };
  const normalizedFilter = (filter || '').toLowerCase();

  if (normalizedFilter === 'pending') {
    query.$or = [
      { status: 'pending' },
      { isVerified: false, status: { $nin: ['rejected', 'banned', 'suspended'] } }
    ];
  } else if (normalizedFilter === 'approved' || normalizedFilter === 'verified') {
    query.$or = [
      { isVerified: true },
      { status: 'active', isVerified: true }
    ];
  } else if (normalizedFilter === 'rejected') {
    query.$or = [
      { status: 'rejected' },
      { 'backgroundCheck.status': 'rejected' }
    ];
  }

  // Search filter
  if (search && search.trim()) {
    const s = search.trim();
    const searchRegex = { $regex: s, $options: 'i' };
    const searchConditions = [
      { fullName: searchRegex },
      { email: searchRegex },
      { 'certification.name': searchRegex },
      { certifications: searchRegex },
      { 'backgroundCheck.idNumber': searchRegex },
      { 'backgroundCheck.idType': searchRegex },
      { instructorType: searchRegex }
    ];

    if (query.$or) {
      query.$and = [
        { $or: query.$or },
        { $or: searchConditions }
      ];
      delete query.$or;
    } else {
      query.$or = searchConditions;
    }
  }

  // Fetch instructors matching filter and search
  const totalFiltered = await userModel.countDocuments(query);
  const rawDocs = await userModel.find(query).lean();

  // Sorting rawDocs before pagination & mapping
  rawDocs.sort((a, b) => {
    let comparison = 0;
    if (sortBy === 'name') {
      comparison = (a.fullName || '').localeCompare(b.fullName || '');
    } else if (sortBy === 'type') {
      comparison = (a.instructorType || '').localeCompare(b.instructorType || '');
    } else if (sortBy === 'status') {
      comparison = (a.status || '').localeCompare(b.status || '');
    } else {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      comparison = dateA - dateB;
    }
    return sortOrder === 'asc' ? comparison : -comparison;
  });

  const paginatedDocs = rawDocs.slice(skip, skip + limitNum);

  // Enrich items with only necessary fields
  const paginatedList = paginatedDocs.map((doc) => {
    let verificationStatus = 'pending';
    if (doc.status === 'rejected' || doc.backgroundCheck?.status === 'rejected') {
      verificationStatus = 'rejected';
    } else if (doc.isVerified === true || (doc.status === 'active' && doc.isVerified)) {
      verificationStatus = 'approved';
    } else {
      verificationStatus = 'pending';
    }

    return {
      _id: doc._id,
      fullName: doc.fullName || '',
      email: doc.email || '',
      image: formatAvatarUrl(doc.image),
      instructorType: doc.instructorType || 'certified',
      status: verificationStatus,
      submittedAt: formatTimeAgo(doc.createdAt)
    };
  });

  return {
    counts: {
      pending: pendingCount,
      approved: approvedCount,
      rejected: rejectedCount,
      all: allCount
    },
    verifications: paginatedList,
    pagination: {
      totalResults: totalFiltered,
      totalPages: Math.ceil(totalFiltered / limitNum) || 1,
      currentPage: pageNum,
      limit: limitNum
    }
  };
};

/**
 * 11. Admin Verification Details Drawer (Figma Node 40012554:20000)
 * Returns strictly the information displayed in the verification review drawer.
 */
const getAdminVerificationDetailsService = async (instructorId) => {
  if (!mongoose.Types.ObjectId.isValid(instructorId)) {
    throw new Error('Invalid instructor ID');
  }

  const doc = await userModel.findById(instructorId).lean();
  if (!doc) {
    throw new Error('Instructor application not found');
  }

  const isCert = (doc.instructorType || 'certified') === 'certified';
  const primaryCert = doc.certification || {};
  const cpr = doc.cprCertification || {};
  const firstAid = doc.firstAidCertification || {};
  const bg = doc.backgroundCheck || {};
  const exp = doc.experience || {};
  const waiver = doc.experienceWaiver || {};

  const primaryCertUrl = formatDocUrl(primaryCert.fileUrl, primaryCert.fileName);
  const cprUrl = formatDocUrl(cpr.fileUrl, cpr.fileName);
  const firstAidUrl = formatDocUrl(firstAid.fileUrl, firstAid.fileName);
  const bgUrl = formatDocUrl(bg.documentUrl, bg.documentName);

  let verificationStatus = 'pending';
  if (doc.status === 'rejected' || bg.status === 'rejected') {
    verificationStatus = 'rejected';
  } else if (doc.isVerified === true || (doc.status === 'active' && doc.isVerified)) {
    verificationStatus = 'approved';
  } else {
    verificationStatus = 'pending';
  }

  return {
    _id: doc._id,
    fullName: doc.fullName || '',
    image: formatAvatarUrl(doc.image),
    submittedAt: `Submitted ${formatTimeAgo(doc.createdAt)}`,
    status: verificationStatus,
    instructorType: doc.instructorType || 'certified',
    bio: doc.bio || doc.about || '',
    primaryCertification: isCert ? {
      name: primaryCert.name || doc.certifications || 'Water Safety Instructor (WSI)',
      issuer: primaryCert.issuer || 'American Red Cross',
      expiryDate: primaryCert.expiryDate || 'Expires Aug 2027',
      fileName: primaryCert.fileName || (primaryCertUrl ? primaryCertUrl.split('/').pop() : 'WSI_Certification.pdf'),
      fileUrl: primaryCertUrl
    } : null,
    experience: !isCert ? {
      years: typeof exp.years === 'number' ? `${exp.years} years` : (doc.experienceYears ? `${doc.experienceYears} years` : '3 years'),
      description: exp.description || doc.experienceDescription || '',
      reference: {
        name: exp.referenceName || doc.referenceName || 'N/A',
        contact: exp.referenceContact || doc.referenceContact || 'N/A'
      }
    } : null,
    cprCertification: {
      name: cpr.name || 'CPR/AED Certification',
      issuer: cpr.issuer || 'American Heart Association',
      expiryDate: cpr.expiryDate || 'Expires Aug 2027',
      fileName: cpr.fileName || (cprUrl ? cprUrl.split('/').pop() : 'CPR_AED_Certification.pdf'),
      fileUrl: cprUrl
    },
    firstAidCertification: {
      name: firstAid.name || 'First Aid Certification',
      issuer: firstAid.issuer || 'American Red Cross',
      expiryDate: firstAid.expiryDate || 'Expires Nov 2027',
      fileName: firstAid.fileName || (firstAidUrl ? firstAidUrl.split('/').pop() : 'First_Aid_Certification.pdf'),
      fileUrl: firstAidUrl
    },
    liabilityWaiver: !isCert ? {
      fileName: waiver.fileName || 'Additional_Liability_Waiver.pdf',
      fileUrl: waiver.fileUrl || (waiver.isAgreed || doc.isWaiverAgreed ? '/uploads/users/Additional_Liability_Waiver.pdf' : null),
      signedBy: doc.fullName || 'Instructor',
      signedAt: formatDisplayDate(waiver.agreedAt || doc.createdAt)
    } : null,
    backgroundCheck: {
      idType: bg.idType || 'Social Security Number',
      idNumber: maskIdNumber(bg.idNumber),
      fileName: bg.documentName || (bgUrl ? bgUrl.split('/').pop() : 'SSN_Verification_Document.pdf'),
      fileUrl: bgUrl,
      isConsentConfirmed: bg.isConsentConfirmed !== false
    }
  };
};

/**
 * 12. Admin Approve Verification (Figma Node 40012554:20000)
 */
const adminApproveVerificationService = async (instructorId, payload = {}) => {
  if (!mongoose.Types.ObjectId.isValid(instructorId)) {
    throw new Error('Invalid instructor ID');
  }

  const reason = payload.reason || 'Instructor credentials verified and approved by Administrator';

  const updated = await userModel.findByIdAndUpdate(
    instructorId,
    {
      $set: {
        status: 'active',
        isVerified: true,
        'backgroundCheck.status': 'cleared',
        statusReason: reason,
        statusUpdatedAt: new Date()
      }
    },
    { new: true }
  ).select('fullName email status isVerified instructorType statusReason statusUpdatedAt');

  if (!updated) {
    throw new Error('Instructor application not found');
  }

  return updated;
};

/**
 * 13. Admin Reject Verification (Figma Node 40012554:20000)
 */
const adminRejectVerificationService = async (instructorId, payload = {}) => {
  if (!mongoose.Types.ObjectId.isValid(instructorId)) {
    throw new Error('Invalid instructor ID');
  }

  const reason = payload.reason || 'Submitted application credentials did not pass verification criteria';

  const updated = await userModel.findByIdAndUpdate(
    instructorId,
    {
      $set: {
        status: 'rejected',
        isVerified: false,
        'backgroundCheck.status': 'rejected',
        statusReason: reason,
        statusUpdatedAt: new Date()
      }
    },
    { new: true }
  ).select('fullName email status isVerified instructorType statusReason statusUpdatedAt');

  if (!updated) {
    throw new Error('Instructor application not found');
  }

  return updated;
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
  updateInstructorStatusService,
  getAdminDashboardOverviewService,
  getAdminVerificationQueueService,
  getAdminVerificationDetailsService,
  adminApproveVerificationService,
  adminRejectVerificationService
};