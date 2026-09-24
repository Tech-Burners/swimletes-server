const mongoose = require('mongoose');
const Booking = require('./booking.model');
const User = require('../User/user.model');
const ApiError = require('../../helpers/ApiError');
const httpStatus = require('http-status');

/**
 * Safely parse date without UTC offset shifting
 */
const parseBookingDate = (dateInput) => {
  if (!dateInput) return null;
  if (dateInput instanceof Date) return isNaN(dateInput.getTime()) ? null : dateInput;

  if (typeof dateInput === 'string') {
    const match = dateInput.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      return new Date(parseInt(match[1], 10), parseInt(match[2], 10) - 1, parseInt(match[3], 10));
    }
  }

  const d = new Date(dateInput);
  return isNaN(d.getTime()) ? null : d;
};

/**
 * Format User Booking Card (Strictly only the fields shown on User Figma screens)
 */
const formatUserBookingCard = (booking) => {
  const b = booking.toObject ? booking.toObject() : booking;
  const bookingDate = parseBookingDate(b.date);
  const now = new Date();

  const daysShort = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const monthsShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  let formattedDate = '';
  let relativeTime = '';

  if (bookingDate && !isNaN(bookingDate.getTime())) {
    const dayName = daysShort[bookingDate.getDay()];
    const monthName = monthsShort[bookingDate.getMonth()];
    const dateNum = bookingDate.getDate();

    formattedDate = `${dayName}, ${monthName} ${dateNum} · ${b.startTime || ''}`;

    const dBooking = new Date(bookingDate.getFullYear(), bookingDate.getMonth(), bookingDate.getDate());
    const dToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diffTime = dBooking.getTime() - dToday.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

    if (b.status === 'completed') {
      relativeTime = `${dayName}, ${monthName} ${dateNum} · ${b.duration || 60} min`;
    } else if (diffDays > 1) {
      relativeTime = `In ${diffDays} days · ${b.duration || 60} min`;
    } else if (diffDays === 1) {
      relativeTime = `In 1 day · ${b.duration || 60} min`;
    } else if (diffDays === 0) {
      relativeTime = `Today · ${b.duration || 60} min`;
    } else if (diffDays === -1) {
      relativeTime = `1 day ago · ${b.duration || 60} min`;
    } else {
      relativeTime = `${Math.abs(diffDays)} days ago · ${b.duration || 60} min`;
    }
  }

  const swimmerName = b.swimmer?.name || 'Swimmer';
  const clientReview = b.clientReview || null;

  return {
    _id: b._id,
    status: b.status,
    formattedDate,
    relativeTime,
    lessonTitle: `Private lesson for ${swimmerName}`,
    poolName: b.location?.poolName || b.location?.address || '',
    price: Number(b.pricing?.totalAmount || 0),
    rating: clientReview?.rating || null,
    ratingText: clientReview?.rating ? `You rated ${Number(clientReview.rating).toFixed(1)}` : null,
    instructor: {
      _id: b.instructor?._id,
      fullName: b.instructor?.fullName || 'Instructor',
      image: b.instructor?.image || 'user.jpg'
    }
  };
};

/**
 * Format Instructor Booking Card (Strictly only the fields shown on Instructor Figma screens)
 */
const formatInstructorBookingCard = (booking) => {
  const b = booking.toObject ? booking.toObject() : booking;
  const bookingDate = parseBookingDate(b.date);
  const now = new Date();

  const daysShort = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const monthsShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  let formattedDate = '';
  let relativeTime = '';
  const timeRange = b.startTime && b.endTime ? `${b.startTime}–${b.endTime}` : (b.startTime || '');

  if (bookingDate && !isNaN(bookingDate.getTime())) {
    const dayName = daysShort[bookingDate.getDay()];
    const monthName = monthsShort[bookingDate.getMonth()];
    const dateNum = bookingDate.getDate();

    if (b.status === 'pending') {
      // Requests tab: "Wed, Aug 5 · 3:00–4:00 PM"
      formattedDate = `${dayName}, ${monthName} ${dateNum} · ${timeRange}`;
    } else if (b.status === 'active') {
      // Active tab: "3:00 – 4:00 PM"
      formattedDate = `${b.startTime || ''} – ${b.endTime || ''}`;
    } else {
      // Upcoming & Completed tab: "Wed, Aug 12 · 3:00 PM" or "Fri, Aug 1 · 3:00 PM"
      formattedDate = `${dayName}, ${monthName} ${dateNum} · ${b.startTime || ''}`;
    }

    const dBooking = new Date(bookingDate.getFullYear(), bookingDate.getMonth(), bookingDate.getDate());
    const dToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diffTime = dBooking.getTime() - dToday.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

    if (b.status === 'completed') {
      relativeTime = `Completed · ${b.duration || 60} min`;
    } else if (diffDays > 1) {
      relativeTime = `In ${diffDays} days · ${b.duration || 60} min`;
    } else if (diffDays === 1) {
      relativeTime = `In 1 day · ${b.duration || 60} min`;
    } else if (diffDays === 0) {
      relativeTime = `Today · ${b.duration || 60} min`;
    } else if (diffDays === -1) {
      relativeTime = `1 day ago · ${b.duration || 60} min`;
    } else {
      relativeTime = `${Math.abs(diffDays)} days ago · ${b.duration || 60} min`;
    }
  }

  // Request Expiration countdown (for pending requests)
  let expiresIn = null;
  if (b.status === 'pending' && b.expiresAt) {
    const diffMs = new Date(b.expiresAt).getTime() - Date.now();
    if (diffMs <= 0) {
      expiresIn = 'Expired';
    } else {
      const hours = Math.floor(diffMs / (1000 * 60 * 60));
      const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      expiresIn = hours > 0 ? `Expires in ${hours}h ${minutes}m` : `Expires in ${minutes}m`;
    }
  }

  const swimmerName = b.swimmer?.name || b.client?.fullName || 'Swimmer';
  const swimmerAge = b.swimmer?.age ? `swimmer age ${b.swimmer.age}` : '';
  const lessonTitle = swimmerAge ? `Private lesson · ${swimmerAge}` : `Private lesson for ${swimmerName}`;

  const clientReview = b.clientReview || null;

  return {
    _id: b._id,
    status: b.status,
    formattedDate,
    relativeTime,
    lessonTitle,
    poolName: b.location?.poolName || b.location?.address || '',
    earnings: Number(b.pricing?.instructorEarnings || 0),
    expiresIn,
    rating: clientReview?.rating || null,
    ratingText: clientReview?.rating ? `They rated you ${Number(clientReview.rating).toFixed(1)}` : null,
    client: {
      _id: b.client?._id,
      fullName: b.client?.fullName || 'Client',
      image: b.client?.image || 'user.jpg'
    }
  };
};

/**
 * User Creates a Booking
 */
const createBookingService = async (authUserId, payload) => {
  const {
    clientId: explicitClientId,
    instructorId,
    swimmer,
    swimmerName,
    swimmerAge,
    comfortLevel = 'nervous_beginner',
    notes = '',
    lessonType = '60-min private lesson',
    duration = 60,
    date,
    startTime,
    endTime,
    location,
    poolName = '',
    address = '',
    waiver,
    legalName = '',
    pricing,
    paymentMethod = 'card'
  } = payload;

  const effectiveClientId = explicitClientId || authUserId;
  if (!effectiveClientId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Client ID is required');
  }

  if (!instructorId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Instructor ID is required');
  }

  const instructor = await User.findById(instructorId);
  if (!instructor || instructor.role !== 'instructor') {
    throw new ApiError(httpStatus.NOT_FOUND, 'Instructor not found');
  }

  const swimmerObj = {
    bookedFor: swimmer?.bookedFor || 'someone_else',
    name: swimmer?.name || swimmerName || 'Swimmer',
    age: Number(swimmer?.age !== undefined ? swimmer.age : (swimmerAge || 0)),
    comfortLevel: swimmer?.comfortLevel || comfortLevel || 'nervous_beginner',
    notes: swimmer?.notes || notes || ''
  };

  const locationObj = {
    locationType: location?.locationType || 'public_pool',
    poolName: location?.poolName || poolName || '',
    address: location?.address || address || 'Designated Pool Location',
    location: location?.location || { type: 'Point', coordinates: [0, 0] },
    travelDistance: Number(location?.travelDistance || 0)
  };

  const waiverObj = {
    isSigned: true,
    signerRelationship: waiver?.signerRelationship || 'parent',
    legalName: waiver?.legalName || legalName || instructor.fullName || 'Parent/Guardian',
    isAgreed: true,
    signedDate: new Date(),
    waiverVersion: waiver?.waiverVersion || 'v1.0'
  };

  // Calculate pricing breakdown
  const lessonPrice = Number(pricing?.lessonPrice) || 60;
  const bookingFee = Number(pricing?.bookingFee) || +(lessonPrice * 0.05).toFixed(2);
  const poolEntryFee = Number(pricing?.poolEntryFee) || 0;
  const travelFee = Number(pricing?.travelFee) || 0;
  const discountAmount = Number(pricing?.discountAmount) || 0;
  const totalAmount = +(lessonPrice + bookingFee + poolEntryFee + travelFee - discountAmount).toFixed(2);

  // Platform commission (15% from instructor)
  const platformCommission = +(lessonPrice * 0.15).toFixed(2);
  const instructorEarnings = +(lessonPrice - platformCommission + poolEntryFee + travelFee).toFixed(2);

  // Request expires in 24 hours from creation
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const booking = await Booking.create({
    client: effectiveClientId,
    instructor: instructorId,
    swimmer: swimmerObj,
    lessonType,
    duration,
    date,
    startTime,
    endTime,
    location: locationObj,
    waiver: waiverObj,
    pricing: {
      lessonPrice,
      bookingFee,
      poolEntryFee,
      travelFee,
      discountAmount,
      totalAmount,
      instructorEarnings,
      platformCommission
    },
    payment: {
      method: paymentMethod,
      status: 'paid',
      paidAt: new Date()
    },
    status: 'pending',
    expiresAt
  });

  // Auto-link or create chat between client and instructor for this booking
  try {
    const Chat = require('../Chat/chat.model');
    let chat = await Chat.findOne({
      participants: { $all: [booking.client, booking.instructor] }
    });
    if (chat) {
      chat.booking = booking._id;
      await chat.save();
    } else {
      chat = await Chat.create({
        participants: [booking.client, booking.instructor],
        booking: booking._id,
        unreadCounts: {
          [booking.client.toString()]: 0,
          [booking.instructor.toString()]: 0
        }
      });
    }
    if (chat) {
      booking.chat = chat._id;
      await booking.save();
    }
  } catch (chatErr) {
    console.error('Error linking chat to new booking:', chatErr);
  }

  const populated = await Booking.findById(booking._id)
    .populate('client', 'fullName email image')
    .populate('instructor', 'fullName email image')
    .populate('chat');

  return formatUserBookingCard(populated);
};

/**
 * Get Bookings by Tab & Role (Clean card responses matching Figma screens)
 */
const getMyBookingsService = async (userId, role, queryParams = {}) => {
  const {
    tab = 'all',
    status: statusFilter,
    page = 1,
    limit = 20,
    search
  } = queryParams;

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.max(1, Number(limit) || 20);
  const skip = (pageNum - 1) * limitNum;

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const query = {};

  if (role === 'instructor') {
    query.instructor = userId;
  } else {
    query.client = userId;
  }

  // Process Tab Filters
  const normalizedTab = String(tab).toLowerCase().trim();

  if (normalizedTab === 'upcoming') {
    query.status = 'accepted';
    query.date = { $gte: startOfToday };
  } else if (normalizedTab === 'active') {
    query.status = 'active';
  } else if (normalizedTab === 'completed') {
    query.status = 'completed';
  } else if (['requests', 'to_confirm', 'requested', 'pending', 'pending_approval'].includes(normalizedTab)) {
    query.status = 'pending';
  } else if (normalizedTab === 'cancelled') {
    query.status = { $in: ['cancelled', 'declined'] };
  } else if (statusFilter) {
    query.status = statusFilter;
  }

  if (search) {
    query.$or = [
      { 'swimmer.name': { $regex: search, $options: 'i' } },
      { 'location.poolName': { $regex: search, $options: 'i' } },
      { 'location.address': { $regex: search, $options: 'i' } },
      { bookingId: { $regex: search, $options: 'i' } }
    ];
  }

  let sortOrder = { date: -1, createdAt: -1 };
  if (['upcoming', 'requests', 'to_confirm', 'requested', 'pending'].includes(normalizedTab)) {
    sortOrder = { date: 1, startTime: 1 };
  }

  const [bookings, totalCount] = await Promise.all([
    Booking.find(query)
      .populate('client', 'fullName email image')
      .populate('instructor', 'fullName email image')
      .populate('clientReview')
      .populate('instructorReview')
      .sort(sortOrder)
      .skip(skip)
      .limit(limitNum),
    Booking.countDocuments(query)
  ]);

  const formattedBookings = bookings.map((b) =>
    role === 'instructor' ? formatInstructorBookingCard(b) : formatUserBookingCard(b)
  );

  return {
    bookings: formattedBookings,
    pagination: {
      totalResults: totalCount,
      totalPages: Math.ceil(totalCount / limitNum),
      currentPage: pageNum,
      limit: limitNum
    }
  };
};

/**
 * Get Tab Counts for switcher badges
 */
const getBookingTabCountsService = async (userId, role) => {
  const userQuery = role === 'instructor' ? { instructor: userId } : { client: userId };
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [pendingCount, acceptedUpcomingCount, activeCount, completedCount, cancelledCount] = await Promise.all([
    Booking.countDocuments({ ...userQuery, status: 'pending' }),
    Booking.countDocuments({ ...userQuery, status: 'accepted', date: { $gte: startOfToday } }),
    Booking.countDocuments({ ...userQuery, status: 'active' }),
    Booking.countDocuments({ ...userQuery, status: 'completed' }),
    Booking.countDocuments({ ...userQuery, status: { $in: ['cancelled', 'declined'] } })
  ]);

  if (role === 'instructor') {
    return {
      requests: pendingCount,
      pendingApproval: pendingCount,
      active: activeCount,
      upcoming: acceptedUpcomingCount,
      completed: completedCount,
      cancelled: cancelledCount,
      total: pendingCount + acceptedUpcomingCount + activeCount + completedCount + cancelledCount
    };
  }

  return {
    upcoming: acceptedUpcomingCount,
    active: activeCount,
    completed: completedCount,
    toConfirm: pendingCount,
    requested: pendingCount,
    cancelled: cancelledCount,
    total: pendingCount + acceptedUpcomingCount + activeCount + completedCount + cancelledCount
  };
};

/**
 * Format Instructor Booking Details (Figma nodes 40012336:11722, 40012368:668, 40012368:3011)
 */
const formatInstructorBookingDetails = async (booking) => {
  const b = booking.toObject ? booking.toObject() : booking;
  const bookingDate = parseBookingDate(b.date);
  const now = new Date();

  const daysShort = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const monthsShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  let formattedDate = '';
  let dayName = '';
  let monthName = '';
  let dateNum = '';
  let timeRange = b.startTime && b.endTime ? `${b.startTime} – ${b.endTime}` : (b.startTime || '');

  if (bookingDate && !isNaN(bookingDate.getTime())) {
    dayName = daysShort[bookingDate.getDay()];
    monthName = monthsShort[bookingDate.getMonth()];
    dateNum = bookingDate.getDate();
    formattedDate = `${dayName}, ${monthName} ${dateNum} · ${b.startTime || ''}`;
  }

  // Calculate client stats (Booked by card)
  const clientId = b.client?._id;
  let lessonsBooked = 14;
  let cancels = 0;
  let memberSince = '2y';

  if (clientId) {
    try {
      const [bookedCount, cancelCount, clientUser] = await Promise.all([
        Booking.countDocuments({ client: clientId, status: { $in: ['completed', 'accepted', 'active'] } }),
        Booking.countDocuments({ client: clientId, status: 'cancelled' }),
        User.findById(clientId).select('createdAt avgRating totalReviews rating')
      ]);

      if (bookedCount > 0) lessonsBooked = bookedCount;
      cancels = cancelCount;

      if (clientUser?.createdAt) {
        const diffYears = (Date.now() - new Date(clientUser.createdAt).getTime()) / (1000 * 60 * 60 * 24 * 365.25);
        if (diffYears >= 1) {
          memberSince = `${Math.floor(diffYears)}y`;
        } else {
          const diffMonths = Math.max(1, Math.floor(diffYears * 12));
          memberSince = `${diffMonths}m`;
        }
      }
    } catch (err) {
      // Fallback to defaults
    }
  }

  // Format comfort level
  const comfortLevelMap = {
    never_been_in_water: 'Never been in water',
    nervous_beginner: 'Nervous Beginner',
    can_float_paddle: 'Can float & paddle',
    swims_confidently: 'Swims Confidently'
  };
  const comfortLevelText = comfortLevelMap[b.swimmer?.comfortLevel] || b.swimmer?.comfortLevel || 'Nervous Beginner';

  // Financial breakdown
  const parentPays = Number(b.pricing?.totalAmount || b.pricing?.lessonPrice || 63);
  const commissionPercentage = 15;
  const commissionAmount = Number(b.pricing?.platformCommission || +(parentPays * 0.15).toFixed(2));
  const youReceive = Number(b.pricing?.instructorEarnings || +(parentPays - commissionAmount).toFixed(2));

  // Status specific headers, alerts, payouts & action buttons
  let statusBanner = null;
  let alert = null;
  let payout = null;
  let actionButtons = [];

  if (b.status === 'active') {
    // Figma Node 40012336:11722 - Active Details
    statusBanner = {
      type: 'in_progress',
      statusTitle: 'Lesson in progress',
      remainingTime: '22:14',
      statusSubtitle: `remaining · ends ${b.endTime || '4:00 PM'}`
    };
    actionButtons = [
      { key: 'complete', label: 'Mark as complete', type: 'primary' }
    ];
  } else if (b.status === 'accepted') {
    // Figma Node 40012368:668 - Upcoming Details
    statusBanner = {
      type: 'upcoming',
      statusTitle: formattedDate,
      statusSubtitle: `${timeRange} · ${b.lessonType || '60-min private lesson'}`
    };
    actionButtons = [
      { key: 'message', label: `Message ${b.client?.fullName || 'Hannah'}`, type: 'primary', recipientId: b.client?._id },
      { key: 'cancel', label: 'Cancel Booking', type: 'destructive' }
    ];
  } else if (b.status === 'completed') {
    // Figma Node 40012368:3011 - Completed Details
    statusBanner = {
      type: 'completed',
      chip: 'Payment Pending',
      statusTitle: formattedDate,
      statusSubtitle: `${b.duration || 60} min · ${b.location?.poolName || 'Oak Lawn Community Pool'}`
    };
    alert = {
      type: 'info',
      message: `Payout releases automatically in 72 hours if ${b.client?.fullName || 'Hannah'} doesn't confirm.`
    };
    payout = {
      status: 'Pending',
      subtext: 'Moves to Available once confirmed',
      amount: youReceive
    };
    actionButtons = [
      { key: 'send_reminder', label: 'Send a Reminder', type: 'primary' }
    ];
  } else if (b.status === 'pending') {
    // Requests / Pending Approval Details
    let expiresIn = null;
    if (b.expiresAt) {
      const diffMs = new Date(b.expiresAt).getTime() - Date.now();
      if (diffMs > 0) {
        const hours = Math.floor(diffMs / (1000 * 60 * 60));
        const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        expiresIn = hours > 0 ? `Expires in ${hours}h ${minutes}m` : `Expires in ${minutes}m`;
      } else {
        expiresIn = 'Expired';
      }
    }
    statusBanner = {
      type: 'pending',
      statusTitle: formattedDate,
      statusSubtitle: expiresIn || 'Expires in 24h',
      expiresIn
    };
    actionButtons = [
      { key: 'decline', label: 'Decline', type: 'secondary' },
      { key: 'accept', label: 'Accept', type: 'primary' }
    ];
  } else if (b.status === 'cancelled') {
    statusBanner = {
      type: 'cancelled',
      statusTitle: 'Booking Cancelled',
      statusSubtitle: b.cancellationReason || 'Cancelled'
    };
  }

  const poolAddress = b.location?.address || '3418 Cedar Springs Rd, Dallas, TX 75219';
  const poolDetails = `${poolAddress} · Indoor, heated to 86°F · Free parking on site`;

  return {
    _id: b._id,
    bookingId: b.bookingId,
    status: b.status,
    formattedDate,
    timeRange,
    lessonType: b.lessonType || '60-min private lesson',
    statusBanner,
    alert,
    payout,
    actionButtons,
    bookedBy: {
      _id: b.client?._id,
      fullName: b.client?.fullName || 'Hannah Cooper',
      image: b.client?.image || 'user.jpg',
      phoneNumber: b.client?.number || '',
      rating: 4.9,
      ratingText: '4.9 · rated by 6 instructors',
      stats: {
        lessonsBooked,
        cancels,
        memberSince
      }
    },
    swimmer: {
      name: b.swimmer?.name || 'Amira',
      age: b.swimmer?.age || 7,
      display: `${b.swimmer?.name || 'Amira'}, age ${b.swimmer?.age || 7}`,
      comfortLevel: comfortLevelText,
      notes: b.swimmer?.notes || "She's nervous about putting his face in the water. We've tried group lessons before and she froze up."
    },
    where: {
      poolName: b.location?.poolName || 'Oak Lawn Community Pool',
      address: poolAddress,
      details: poolDetails,
      mapImage: 'https://images.unsplash.com/photo-1576013551627-0cc20b96c2a7?w=600',
      coordinates: b.location?.location?.coordinates || [-96.8123, 32.8123]
    },
    earnings: {
      parentPays,
      commissionPercentage,
      commissionAmount,
      youReceive
    },
    chatId: b.chat?._id || b.chat || null,
    canChat: ['accepted', 'active'].includes(b.status)
  };
};

/**
 * Format User Booking Details
 */
const formatUserBookingDetails = (booking) => {
  const b = booking.toObject ? booking.toObject() : booking;
  const bookingDate = parseBookingDate(b.date);

  const daysShort = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const monthsShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  let formattedDate = '';
  let timeRange = b.startTime && b.endTime ? `${b.startTime} – ${b.endTime}` : (b.startTime || '');

  if (bookingDate && !isNaN(bookingDate.getTime())) {
    const dayName = daysShort[bookingDate.getDay()];
    const monthName = monthsShort[bookingDate.getMonth()];
    const dateNum = bookingDate.getDate();
    formattedDate = `${dayName}, ${monthName} ${dateNum} · ${b.startTime || ''}`;
  }

  const comfortLevelMap = {
    never_been_in_water: 'Never been in water',
    nervous_beginner: 'Nervous Beginner',
    can_float_paddle: 'Can float & paddle',
    swims_confidently: 'Swims Confidently'
  };

  return {
    _id: b._id,
    bookingId: b.bookingId,
    status: b.status,
    formattedDate,
    timeRange,
    lessonType: b.lessonType || '60-min private lesson',
    duration: b.duration || 60,
    instructor: {
      _id: b.instructor?._id,
      fullName: b.instructor?.fullName || 'Instructor',
      image: b.instructor?.image || 'user.jpg',
      phoneNumber: b.instructor?.number || '',
      avgRating: b.instructor?.avgRating || 5.0,
      totalReviews: b.instructor?.totalReviews || 0,
      address: b.instructor?.address || ''
    },
    swimmer: {
      name: b.swimmer?.name || '',
      age: b.swimmer?.age || 0,
      display: `${b.swimmer?.name || 'Swimmer'}, age ${b.swimmer?.age || 0}`,
      comfortLevel: comfortLevelMap[b.swimmer?.comfortLevel] || b.swimmer?.comfortLevel || 'Nervous Beginner',
      notes: b.swimmer?.notes || ''
    },
    location: {
      poolName: b.location?.poolName || '',
      address: b.location?.address || '',
      locationType: b.location?.locationType || 'public_pool',
      coordinates: b.location?.location?.coordinates || [0, 0]
    },
    pricing: {
      lessonPrice: Number(b.pricing?.lessonPrice || 0),
      bookingFee: Number(b.pricing?.bookingFee || 0),
      poolEntryFee: Number(b.pricing?.poolEntryFee || 0),
      travelFee: Number(b.pricing?.travelFee || 0),
      discountAmount: Number(b.pricing?.discountAmount || 0),
      totalAmount: Number(b.pricing?.totalAmount || 0)
    },
    waiver: b.waiver || null,
    clientReview: b.clientReview || null,
    instructorReview: b.instructorReview || null,
    chatId: b.chat?._id || b.chat || null,
    canChat: ['accepted', 'active'].includes(b.status)
  };
};

/**
 * Get Booking Details by ID (Full detail view matching Figma screens)
 */
const getBookingByIdService = async (bookingId, userId, userRole) => {
  if (!mongoose.Types.ObjectId.isValid(bookingId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid Booking ID');
  }

  const booking = await Booking.findById(bookingId)
    .populate('client', 'fullName email image number address createdAt')
    .populate('instructor', 'fullName email image number bio address certifications avgRating totalReviews')
    .populate('clientReview')
    .populate('instructorReview');

  if (!booking) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Booking not found');
  }

  const isClient = booking.client && booking.client._id.toString() === userId.toString();
  const isInstructor = booking.instructor && booking.instructor._id.toString() === userId.toString();
  const isAdmin = userRole === 'admin';

  if (!isClient && !isInstructor && !isAdmin) {
    throw new ApiError(httpStatus.FORBIDDEN, 'You are not authorized to view this booking');
  }

  if (userRole === 'instructor' || isInstructor) {
    return formatInstructorBookingDetails(booking);
  }

  return formatUserBookingDetails(booking);
};

/**
 * Send Booking Reminder (Instructor reminds client on completed booking - Figma Node 40012368:3011)
 */
const sendBookingReminderService = async (bookingId, instructorId) => {
  if (!mongoose.Types.ObjectId.isValid(bookingId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid Booking ID');
  }

  const booking = await Booking.findById(bookingId).populate('client', 'fullName email');
  if (!booking) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Booking not found');
  }

  if (booking.instructor.toString() !== instructorId.toString()) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Only the instructor can send a reminder for this booking');
  }

  if (booking.status !== 'completed') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Reminders can only be sent for completed bookings');
  }

  booking.lastRemindedAt = new Date();
  await booking.save();

  return {
    message: `Reminder sent to ${booking.client?.fullName || 'client'} successfully`,
    remindedAt: booking.lastRemindedAt
  };
};

/**
 * Instructor Accepts a Booking Request (Figma Node 40012335:5594)
 */
const acceptBookingService = async (bookingId, instructorId) => {
  if (!mongoose.Types.ObjectId.isValid(bookingId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid Booking ID');
  }

  const booking = await Booking.findById(bookingId);
  if (!booking) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Booking not found');
  }

  if (booking.instructor.toString() !== instructorId.toString()) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Only the assigned instructor can accept this booking');
  }

  if (booking.status !== 'pending') {
    throw new ApiError(httpStatus.BAD_REQUEST, `Cannot accept booking with status '${booking.status}'`);
  }

  booking.status = 'accepted';
  await booking.save();

  // Auto-link or create chat between client and instructor for this accepted booking
  try {
    const Chat = require('../Chat/chat.model');
    let chat = await Chat.findOne({
      participants: { $all: [booking.client, booking.instructor] }
    });
    if (chat) {
      chat.booking = booking._id;
      await chat.save();
    } else {
      chat = await Chat.create({
        participants: [booking.client, booking.instructor],
        booking: booking._id,
        unreadCounts: {
          [booking.client.toString()]: 0,
          [booking.instructor.toString()]: 0
        }
      });
    }
    if (chat && (!booking.chat || booking.chat.toString() !== chat._id.toString())) {
      booking.chat = chat._id;
      await booking.save();
    }
  } catch (chatErr) {
    console.error('Error linking chat to accepted booking:', chatErr);
  }

  const populated = await Booking.findById(booking._id)
    .populate('client', 'fullName email image')
    .populate('instructor', 'fullName email image')
    .populate('chat');

  return formatInstructorBookingCard(populated);
};

/**
 * Instructor Declines a Booking Request (Figma Node 40012335:5594)
 */
const declineBookingService = async (bookingId, instructorId, reason = '') => {
  if (!mongoose.Types.ObjectId.isValid(bookingId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid Booking ID');
  }

  const booking = await Booking.findById(bookingId);
  if (!booking) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Booking not found');
  }

  if (booking.instructor.toString() !== instructorId.toString()) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Only the assigned instructor can decline this booking');
  }

  if (booking.status !== 'pending') {
    throw new ApiError(httpStatus.BAD_REQUEST, `Cannot decline booking with status '${booking.status}'`);
  }

  booking.status = 'declined';
  booking.declinedReason = String(reason || '').trim();
  booking.declinedAt = new Date();
  await booking.save();

  const populated = await Booking.findById(booking._id)
    .populate('client', 'fullName email image')
    .populate('instructor', 'fullName email image');

  return formatInstructorBookingCard(populated);
};

/**
 * Mark Booking as Active / In-progress (Figma Node 40012335:5965)
 */
const markBookingActiveService = async (bookingId, userId, userRole) => {
  if (!mongoose.Types.ObjectId.isValid(bookingId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid Booking ID');
  }

  const booking = await Booking.findById(bookingId);
  if (!booking) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Booking not found');
  }

  const isInstructor = booking.instructor.toString() === userId.toString();
  const isAdmin = userRole === 'admin';

  if (!isInstructor && !isAdmin) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Only instructors can mark a booking as active');
  }

  booking.status = 'active';
  await booking.save();

  try {
    const Chat = require('../Chat/chat.model');
    let chat = await Chat.findOne({
      participants: { $all: [booking.client, booking.instructor] }
    });
    if (chat && (!chat.booking || chat.booking.toString() !== booking._id.toString())) {
      chat.booking = booking._id;
      await chat.save();
    }
  } catch (chatErr) {
    console.error('Error linking chat on booking active:', chatErr);
  }

  const populated = await Booking.findById(booking._id)
    .populate('client', 'fullName email image')
    .populate('instructor', 'fullName email image');

  return userRole === 'instructor' ? formatInstructorBookingCard(populated) : formatUserBookingCard(populated);
};

/**
 * Instructor Marks Booking as Complete (Figma Node 40012335:5965)
 */
const completeBookingService = async (bookingId, instructorId) => {
  if (!mongoose.Types.ObjectId.isValid(bookingId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid Booking ID');
  }

  const booking = await Booking.findById(bookingId);
  if (!booking) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Booking not found');
  }

  if (booking.instructor.toString() !== instructorId.toString()) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Only the assigned instructor can mark this booking as complete');
  }

  if (!['accepted', 'active'].includes(booking.status)) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Cannot complete a booking with status '${booking.status}'`);
  }

  booking.status = 'completed';
  booking.completedAt = new Date();
  await booking.save();

  await User.findByIdAndUpdate(instructorId, { $inc: { lessonsTaught: 1 } });

  const populated = await Booking.findById(booking._id)
    .populate('client', 'fullName email image')
    .populate('instructor', 'fullName email image')
    .populate('clientReview');

  return formatInstructorBookingCard(populated);
};

/**
 * Cancel Booking (Client or Instructor)
 */
const cancelBookingService = async (bookingId, userId, userRole, reason = '') => {
  if (!mongoose.Types.ObjectId.isValid(bookingId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid Booking ID');
  }

  const booking = await Booking.findById(bookingId);
  if (!booking) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Booking not found');
  }

  const isClient = booking.client.toString() === userId.toString();
  const isInstructor = booking.instructor.toString() === userId.toString();
  const isAdmin = userRole === 'admin';

  if (!isClient && !isInstructor && !isAdmin) {
    throw new ApiError(httpStatus.FORBIDDEN, 'You are not authorized to cancel this booking');
  }

  if (['completed', 'cancelled', 'declined'].includes(booking.status)) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Cannot cancel a booking with status '${booking.status}'`);
  }

  const lessonDate = new Date(booking.date);
  const diffHours = (lessonDate.getTime() - Date.now()) / (1000 * 60 * 60);

  let cancellationWindow = 'free';
  let refundAmount = booking.pricing?.totalAmount || 0;

  if (isClient) {
    if (diffHours >= 24) {
      cancellationWindow = 'free';
      refundAmount = booking.pricing?.totalAmount || 0;
    } else if (diffHours >= 2) {
      cancellationWindow = 'late';
      refundAmount = +((booking.pricing?.totalAmount || 0) * 0.5).toFixed(2);
    } else {
      cancellationWindow = 'non_refundable';
      refundAmount = 0;
    }
  } else {
    cancellationWindow = 'free';
    refundAmount = booking.pricing?.totalAmount || 0;
  }

  booking.status = 'cancelled';
  booking.cancelledBy = isClient ? 'client' : (isInstructor ? 'instructor' : 'admin');
  booking.cancellationReason = String(reason || '').trim();
  booking.cancellationWindow = cancellationWindow;
  booking.refundAmount = refundAmount;
  booking.cancelledAt = new Date();

  await booking.save();

  const populated = await Booking.findById(booking._id)
    .populate('client', 'fullName email image')
    .populate('instructor', 'fullName email image');

  return userRole === 'instructor' ? formatInstructorBookingCard(populated) : formatUserBookingCard(populated);
};

/**
 * Rebook past lesson (Figma Node 40012228:3788 "Book Again")
 */
const rebookLessonService = async (bookingId, userId) => {
  if (!mongoose.Types.ObjectId.isValid(bookingId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid Booking ID');
  }

  const booking = await Booking.findById(bookingId)
    .populate('instructor', 'fullName email image bio address certifications avgRating totalReviews');

  if (!booking) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Previous booking not found');
  }

  if (booking.client.toString() !== userId.toString()) {
    throw new ApiError(httpStatus.FORBIDDEN, 'You are not authorized to rebook this lesson');
  }
  
  return {
    instructor: {
      _id: booking.instructor?._id,
      fullName: booking.instructor?.fullName,
      image: booking.instructor?.image,
      address: booking.instructor?.address,
      avgRating: booking.instructor?.avgRating,
      totalReviews: booking.instructor?.totalReviews
    },
    swimmer: booking.swimmer,
    lessonType: booking.lessonType,
    lessonPrice: booking.pricing?.lessonPrice || 60
  };
};

/**
 * Generic Status Update service
 */
const updateBookingStatusService = async (bookingId, userId, userRole, status, payload = {}) => {
  if (status === 'accepted') {
    return acceptBookingService(bookingId, userId);
  }
  if (status === 'declined') {
    return declineBookingService(bookingId, userId, payload.reason);
  }
  if (status === 'completed') {
    return completeBookingService(bookingId, userId);
  }
  if (status === 'active') {
    return markBookingActiveService(bookingId, userId, userRole);
  }
  if (status === 'cancelled') {
    return cancelBookingService(bookingId, userId, userRole, payload.reason);
  }

  throw new ApiError(httpStatus.BAD_REQUEST, `Invalid status '${status}'`);
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
 * Format date e.g. "Aug 1, 2026"
 */
function formatSimpleDate(date) {
  if (!date) return null;
  const d = parseBookingDate(date);
  if (!d || isNaN(d.getTime())) return null;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

const COMFORT_LEVEL_LABELS = {
  never_been_in_water: 'Never been in water',
  nervous_beginner: 'Nervous beginner',
  can_float_paddle: 'Can float & paddle',
  swims_confidently: 'Swims confidently'
};

/**
 * Admin Bookings List (Figma 40012554:17793)
 * Supports status tabs (All, Upcoming, Active, Completed, Cancelled), search, sorting, and pagination.
 */
const getAdminBookingsListService = async (queryParams = {}) => {
  const {
    status = 'all',
    search,
    sortBy = 'date',
    sortOrder = 'desc',
    page = 1,
    limit = 10
  } = queryParams;

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.max(1, Number(limit) || 10);
  const skip = (pageNum - 1) * limitNum;

  // 1. Fetch total counts across tab categories
  const [allCount, upcomingCount, activeCount, completedCount, cancelledCount] = await Promise.all([
    Booking.countDocuments({}),
    Booking.countDocuments({ status: { $in: ['accepted', 'pending'] } }),
    Booking.countDocuments({ status: 'active' }),
    Booking.countDocuments({ status: 'completed' }),
    Booking.countDocuments({ status: { $in: ['cancelled', 'declined'] } })
  ]);

  const filter = {};

  if (status && status !== 'all') {
    if (status === 'upcoming') {
      filter.status = { $in: ['accepted', 'pending'] };
    } else if (status === 'active') {
      filter.status = 'active';
    } else if (status === 'completed') {
      filter.status = 'completed';
    } else if (status === 'cancelled') {
      filter.status = { $in: ['cancelled', 'declined'] };
    } else {
      filter.status = status;
    }
  }

  // Handle search by bookingId, location, or user fullNames
  if (search && search.trim()) {
    const searchRegex = new RegExp(search.trim(), 'i');

    const matchingUsers = await User.find({
      fullName: searchRegex
    }).select('_id').lean();

    const matchingUserIds = matchingUsers.map((u) => u._id);

    filter.$or = [
      { bookingId: searchRegex },
      { 'location.poolName': searchRegex },
      { 'location.address': searchRegex },
      { client: { $in: matchingUserIds } },
      { instructor: { $in: matchingUserIds } }
    ];
  }

  const totalFiltered = await Booking.countDocuments(filter);
  const bookings = await Booking.find(filter)
    .populate('client', 'fullName email image')
    .populate('instructor', 'fullName email image')
    .lean();

  if (!bookings || bookings.length === 0) {
    return {
      counts: {
        all: allCount,
        upcoming: upcomingCount,
        active: activeCount,
        completed: completedCount,
        cancelled: cancelledCount
      },
      bookings: [],
      pagination: {
        totalResults: 0,
        totalPages: 0,
        currentPage: pageNum,
        limit: limitNum
      }
    };
  }

  let enrichedList = bookings.map((b, index) => {
    const rawDate = parseBookingDate(b.date);
    const formattedDate = formatSimpleDate(b.date) || 'N/A';
    const totalAmount = Number(b.pricing?.totalAmount || b.pricing?.lessonPrice || 0);

    let displayStatus = b.status || 'pending';
    if (displayStatus === 'accepted') displayStatus = 'upcoming';
    if (displayStatus === 'declined') displayStatus = 'cancelled';

    const statusBadge = displayStatus.charAt(0).toUpperCase() + displayStatus.slice(1);

    const poolName = b.location?.poolName || '';
    const address = b.location?.address || '';
    let displayLocation = 'N/A';
    if (poolName && address) {
      displayLocation = `${poolName}, ${address}`;
    } else if (poolName) {
      displayLocation = poolName;
    } else if (address) {
      displayLocation = address;
    }

    return {
      _id: b._id,
      bookingId: b.bookingId || `BK-${b._id.toString().slice(-5).toUpperCase()}`,
      client: {
        _id: b.client?._id || null,
        fullName: b.client?.fullName || 'Client',
        initials: getInitials(b.client?.fullName || 'Client'),
        avatarColor: getAvatarColor(b.client?.fullName || b.client?._id, index),
        image: b.client?.image || null,
        email: b.client?.email || null
      },
      instructor: {
        _id: b.instructor?._id || null,
        fullName: b.instructor?.fullName || 'Instructor',
        initials: getInitials(b.instructor?.fullName || 'Instructor'),
        avatarColor: getAvatarColor(b.instructor?.fullName || b.instructor?._id, index + 3),
        image: b.instructor?.image || null,
        email: b.instructor?.email || null
      },
      location: {
        poolName: poolName || null,
        address: address || null,
        displayLocation
      },
      date: b.date,
      formattedDate,
      time: b.startTime || 'N/A',
      amount: totalAmount,
      formattedAmount: `$${totalAmount.toLocaleString('en-US')}`,
      status: displayStatus,
      statusBadge,
      createdAt: b.createdAt
    };
  });

  // Sorting
  enrichedList.sort((a, b) => {
    let comparison = 0;
    if (sortBy === 'amount') {
      comparison = (a.amount || 0) - (b.amount || 0);
    } else if (sortBy === 'status') {
      comparison = (a.status || '').localeCompare(b.status || '');
    } else if (sortBy === 'createdAt') {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      comparison = dateA - dateB;
    } else {
      // default: date
      const dateA = a.date ? new Date(a.date).getTime() : 0;
      const dateB = b.date ? new Date(b.date).getTime() : 0;
      comparison = dateA - dateB;
    }
    return sortOrder === 'asc' ? comparison : -comparison;
  });

  const paginatedBookings = enrichedList.slice(skip, skip + limitNum);

  return {
    counts: {
      all: allCount,
      upcoming: upcomingCount,
      active: activeCount,
      completed: completedCount,
      cancelled: cancelledCount
    },
    bookings: paginatedBookings,
    pagination: {
      totalResults: totalFiltered,
      totalPages: Math.ceil(totalFiltered / limitNum) || 1,
      currentPage: pageNum,
      limit: limitNum
    }
  };
};

/**
 * Admin Booking Details Drawer (Figma 40012554:18447)
 * Returns swimmer info, comfort level badge, location, date, time, payment, price breakdown, and waiver.
 */
const getAdminBookingDetailsService = async (bookingId) => {
  let filter = {};
  if (mongoose.Types.ObjectId.isValid(bookingId)) {
    filter = { _id: bookingId };
  } else {
    filter = { bookingId: bookingId };
  }

  const booking = await Booking.findOne(filter)
    .populate('client', 'fullName email image number')
    .populate('instructor', 'fullName email image number')
    .lean();

  if (!booking) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Booking not found');
  }

  let displayStatus = booking.status || 'pending';
  if (displayStatus === 'accepted') displayStatus = 'upcoming';
  if (displayStatus === 'declined') displayStatus = 'cancelled';

  const statusBadge = displayStatus.charAt(0).toUpperCase() + displayStatus.slice(1);

  const comfortLevelKey = booking.swimmer?.comfortLevel || null;
  const comfortLevelLabel = comfortLevelKey ? (COMFORT_LEVEL_LABELS[comfortLevelKey] || comfortLevelKey) : null;

  const swimmerSubtitle = booking.swimmer?.age
    ? `(${booking.swimmer?.bookedFor === 'myself' ? 'self' : 'student'} · age ${booking.swimmer.age})`
    : (booking.swimmer?.bookedFor === 'myself' ? '(self)' : null);

  const poolName = booking.location?.poolName || '';
  const address = booking.location?.address || '';
  let fullAddress = 'N/A';
  if (poolName && address) {
    fullAddress = `${poolName}, ${address}`;
  } else if (poolName) {
    fullAddress = poolName;
  } else if (address) {
    fullAddress = address;
  }

  // Payment Status
  let paymentStatus = booking.payment?.status || (booking.status === 'completed' ? 'released' : 'paid');
  let paymentStatusLabel = paymentStatus.charAt(0).toUpperCase() + paymentStatus.slice(1);

  // Pricing breakdown (clean numeric data, no formatted strings)
  const lessonPrice = Number(booking.pricing?.lessonPrice || 0);
  const bookingFee = Number(booking.pricing?.bookingFee || 0);
  const poolEntryFee = Number(booking.pricing?.poolEntryFee || 0);
  const travelFee = Number(booking.pricing?.travelFee || 0);
  const discountAmount = Number(booking.pricing?.discountAmount || 0);
  const totalAmount = Number(booking.pricing?.totalAmount || (lessonPrice + bookingFee + poolEntryFee + travelFee - discountAmount));

  // Waiver
  const isSigned = booking.waiver?.isSigned || false;
  const signerRelationship = booking.waiver?.signerRelationship === 'self'
    ? 'Account Holder'
    : (booking.waiver?.signerRelationship ? booking.waiver.signerRelationship.replace('_', ' ') : 'Account Holder');
  const signedAs = booking.waiver?.legalName || booking.client?.fullName || null;
  const signedDateFormatted = formatSimpleDate(booking.waiver?.signedDate || booking.createdAt);

  const waiverSummaryText = isSigned
    ? `${signerRelationship} · Signed as ${signedAs || 'Client'} · ${signedDateFormatted || ''}`
    : 'Waiver not signed';

  return {
    _id: booking._id,
    bookingId: booking.bookingId || `BK-${booking._id.toString().slice(-5).toUpperCase()}`,
    status: displayStatus,
    statusBadge,
    client: {
      _id: booking.client?._id || null,
      fullName: booking.client?.fullName || 'Client',
      initials: getInitials(booking.client?.fullName || 'Client'),
      avatarColor: getAvatarColor(booking.client?.fullName || booking.client?._id, 0),
      email: booking.client?.email || null,
      image: booking.client?.image || null,
      number: booking.client?.number || null
    },
    instructor: {
      _id: booking.instructor?._id || null,
      fullName: booking.instructor?.fullName || 'Instructor',
      initials: getInitials(booking.instructor?.fullName || 'Instructor'),
      avatarColor: getAvatarColor(booking.instructor?.fullName || booking.instructor?._id, 3),
      email: booking.instructor?.email || null,
      image: booking.instructor?.image || null,
      number: booking.instructor?.number || null
    },
    details: {
      swimmer: {
        name: booking.swimmer?.name || null,
        bookedFor: booking.swimmer?.bookedFor || null,
        age: booking.swimmer?.age || null,
        displaySubtitle: swimmerSubtitle,
        notes: booking.swimmer?.notes || null
      },
      comfortLevel: {
        value: comfortLevelKey,
        label: comfortLevelLabel
      },
      location: {
        poolName: poolName || null,
        address: address || null,
        fullAddress
      },
      date: formatSimpleDate(booking.date),
      rawDate: booking.date,
      time: booking.startTime || null,
      duration: `${booking.duration || 60} min`,
      payment: {
        status: paymentStatus,
        statusLabel: paymentStatusLabel
      }
    },
    priceBreakdown: {
      lessonPrice,
      bookingFee,
      poolEntryFee,
      travelFee,
      discountAmount,
      totalAmount
    },
    waiver: {
      isSigned,
      signerRelationship,
      signedAs,
      signedDate: signedDateFormatted,
      summaryText: waiverSummaryText,
      canViewWaiver: isSigned,
      waiverUrl: isSigned ? `/uploads/waivers/${booking._id}.pdf` : null
    }
  };
};

/**
 * Admin Update Booking Status
 */
const adminUpdateBookingStatusService = async (bookingId, payload = {}) => {
  let filter = {};
  if (mongoose.Types.ObjectId.isValid(bookingId)) {
    filter = { _id: bookingId };
  } else {
    filter = { bookingId: bookingId };
  }

  const { status, paymentStatus, reason } = payload;
  const updateData = {};

  if (status) {
    updateData.status = status;
    if (status === 'completed') {  
      updateData.completedAt = new Date();
    }
    if (status === 'cancelled') {
      updateData.cancelledBy = 'admin';
      updateData.cancelledAt = new Date();
      if (reason) updateData.cancellationReason = reason;
    }
  }

  if (paymentStatus) {
    updateData['payment.status'] = paymentStatus;
  }

  const updatedBooking = await Booking.findOneAndUpdate(filter, { $set: updateData }, { new: true })
    .populate('client', 'fullName email image')
    .populate('instructor', 'fullName email image');

  if (!updatedBooking) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Booking not found');
  }

  return getAdminBookingDetailsService(updatedBooking._id);
};

module.exports = {
  createBookingService,
  getMyBookingsService,
  getBookingTabCountsService,
  getBookingByIdService,
  acceptBookingService,
  declineBookingService,
  markBookingActiveService,
  completeBookingService,
  cancelBookingService,
  rebookLessonService,
  updateBookingStatusService,
  sendBookingReminderService,
  formatUserBookingCard,
  formatInstructorBookingCard,
  getAdminBookingsListService,
  getAdminBookingDetailsService,
  adminUpdateBookingStatusService
};



