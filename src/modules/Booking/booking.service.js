const mongoose = require('mongoose');
const Booking = require('./booking.model');
const User = require('../User/user.model');
const ApiError = require('../../helpers/ApiError');
const { status: httpStatus } = require('http-status');
const stripeHelper = require('../../helpers/stripe');
const {
  timeStringToMinutes,
  minutesToTimeString,
  resolveEndTime,
  isTimeOverlapping
} = require('../../helpers/timeHelper');

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
 * Resolves base URL for Stripe redirect callbacks
 */
const getBaseUrl = (req = null) => {
  // 1. If request comes from an active client with host headers, prioritize that active host!
  if (req && req.headers) {
    const forwardedHost = req.headers['x-forwarded-host'];
    const host = forwardedHost || req.headers.host;
    if (host) {
      const proto = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
      return `${proto}://${host}`.replace(/\/+$/, '');
    }
  }

  if (process.env.BACKEND_URL) {
    return process.env.BACKEND_URL.replace(/\/+$/, '');
  }

  if (process.env.API_SERVER_IP) {
    return `http://${process.env.API_SERVER_IP}:${process.env.BACKEND_PORT || 8049}`;
  }

  return `http://localhost:${process.env.BACKEND_PORT || 8049}`;
};

/**
 * Check for booking conflicts for an instructor on a specific date & time
 * Detects overlapping (collapsing) time intervals.
 * Only PAID/CONFIRMED bookings block the time slot.
 */
const checkBookingConflict = async ({
  instructorId,
  clientId = null,
  date,
  startTime,
  endTime = null,
  duration = 60,
  excludeBookingId = null
}) => {
  if (!date || !startTime) return null;
  const bookingDate = parseBookingDate(date);
  if (!bookingDate || isNaN(bookingDate.getTime())) return null;

  const resolvedEndTime = resolveEndTime(startTime, endTime, duration);

  const startOfDay = new Date(bookingDate);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(bookingDate);
  endOfDay.setHours(23, 59, 59, 999);

  // 1. Check Instructor Conflict (Double-Booking Prevention)
  const instructorBookings = await Booking.find({
    instructor: instructorId,
    ...(excludeBookingId ? { _id: { $ne: excludeBookingId } } : {}),
    date: { $gte: startOfDay, $lte: endOfDay },
    status: { $in: ['pending', 'accepted', 'active'] },
    'payment.status': 'paid'
  });

  const conflictingInstructorBooking = instructorBookings.find((b) => {
    const bEndTime = resolveEndTime(b.startTime, b.endTime, b.duration);
    return isTimeOverlapping(startTime, resolvedEndTime, b.startTime, bEndTime);
  });

  if (conflictingInstructorBooking) {
    const conflictTimeRange = conflictingInstructorBooking.startTime && conflictingInstructorBooking.endTime
      ? `${conflictingInstructorBooking.startTime} – ${conflictingInstructorBooking.endTime}`
      : conflictingInstructorBooking.startTime;
    return {
      hasConflict: true,
      type: 'instructor_conflict',
      conflictingBookingId: conflictingInstructorBooking.bookingId || conflictingInstructorBooking._id,
      conflictingTime: conflictTimeRange,
      message: 'This time slot is already booked. Please choose another time.'
    };
  }

  // 2. Check Client Conflict (Client cannot book overlapping lessons at the same time)
  if (clientId) {
    const clientBookings = await Booking.find({
      client: clientId,
      ...(excludeBookingId ? { _id: { $ne: excludeBookingId } } : {}),
      date: { $gte: startOfDay, $lte: endOfDay },
      status: { $in: ['pending', 'accepted', 'active'] },
      'payment.status': 'paid'
    });

    const conflictingClientBooking = clientBookings.find((b) => {
      const bEndTime = resolveEndTime(b.startTime, b.endTime, b.duration);
      return isTimeOverlapping(startTime, resolvedEndTime, b.startTime, bEndTime);
    });

    if (conflictingClientBooking) {
      const conflictTimeRange = conflictingClientBooking.startTime && conflictingClientBooking.endTime
        ? `${conflictingClientBooking.startTime} – ${conflictingClientBooking.endTime}`
        : conflictingClientBooking.startTime;
      return {
        hasConflict: true,
        type: 'client_conflict',
        conflictingBookingId: conflictingClientBooking.bookingId || conflictingClientBooking._id,
        conflictingTime: conflictTimeRange,
        message: `You already have another swimming lesson booked at ${conflictTimeRange}. Please select a different time slot.`
      };
    }
  }

  // 3. Check Instructor Weekly Availability (if instructor has an Availability schedule)
  try {
    const Availability = require('../Availability/availability.model');
    const availabilityDoc = await Availability.findOne({ instructor: instructorId });
    if (availabilityDoc && availabilityDoc.weeklySchedule && availabilityDoc.weeklySchedule.length > 0) {
      const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const dayName = daysOfWeek[bookingDate.getDay()];
      const daySchedule = availabilityDoc.weeklySchedule.find(
        (item) => item.day.toLowerCase() === dayName.toLowerCase()
      );

      if (daySchedule) {
        if (!daySchedule.isAvailable || !daySchedule.slots || daySchedule.slots.length === 0) {
          return {
            hasConflict: true,
            type: 'availability_closed',
            message: `Instructor is not available on ${dayName.charAt(0).toUpperCase() + dayName.slice(1)}s. Please choose an open day.`
          };
        }

        const reqStartMin = timeStringToMinutes(startTime);
        const reqEndMin = timeStringToMinutes(resolvedEndTime);

        if (reqStartMin !== null && reqEndMin !== null) {
          const fitsInSlot = daySchedule.slots.some((slot) => {
            const slotStartMin = timeStringToMinutes(slot.startTime);
            const slotEndMin = timeStringToMinutes(slot.endTime);
            if (slotStartMin === null || slotEndMin === null) return false;
            return reqStartMin >= slotStartMin && reqEndMin <= slotEndMin;
          });

          if (!fitsInSlot) {
            return {
              hasConflict: true,
              type: 'outside_availability',
              message: `Requested time (${startTime} – ${resolvedEndTime}) is outside the instructor's available hours for this day. Please choose another time.`
            };
          }
        }
      }
    }
  } catch (avErr) {
    // Continue cleanly if availability check fails
  }

  return null;
};

/**
 * Format "Review & Pay" Screen Payload (Strictly matching Figma 40012199:3518)
 * Strips all unnecessary database metadata, returning exact visual fields.
 */
const formatReviewAndPayResponse = (booking, checkoutSession = null) => {
  const b = booking.toObject ? booking.toObject() : booking;
  const bDate = parseBookingDate(b.date);
  const daysShort = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const monthsShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthsLong = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  let formattedDate = '';
  if (bDate && !isNaN(bDate.getTime())) {
    formattedDate = `${daysShort[bDate.getDay()]}, ${monthsShort[bDate.getMonth()]} ${bDate.getDate()} ${bDate.getFullYear()}`;
  }

  const comfortLevelMap = {
    never_been_in_water: 'Never been in water',
    nervous_beginner: 'Nervous beginner',
    can_float_paddle: 'Can float & paddle',
    swims_confidently: 'Swims confidently'
  };

  const swimmerName = b.swimmer?.name || 'Swimmer';
  const swimmerAge = b.swimmer?.age !== undefined && b.swimmer?.age !== null ? b.swimmer.age : '';
  const swimmerDisplay = swimmerAge !== '' ? `${swimmerName}, age ${swimmerAge}` : swimmerName;
  const comfortLevel = comfortLevelMap[b.swimmer?.comfortLevel] || b.swimmer?.comfortLevel || 'Nervous beginner';

  const durationMin = b.duration || 60;
  const lessonType = b.lessonType || `${durationMin}-min private lesson`;
  const timeRange = b.startTime && b.endTime ? `${b.startTime} – ${b.endTime}` : (b.startTime || '');

  let waiverSignedDate = '';
  if (b.waiver?.signedDate) {
    const wd = new Date(b.waiver.signedDate);
    if (!isNaN(wd.getTime())) {
      const d = wd.getDate();
      const suffix = (d > 3 && d < 21) ? 'th' : (['th', 'st', 'nd', 'rd'][d % 10] || 'th');
      waiverSignedDate = `${d}${suffix} ${monthsLong[wd.getMonth()]} ${wd.getFullYear()}`;
    }
  }

  const signerName = b.waiver?.legalName || b.client?.fullName || 'Paula McMahon';
  const waiverText = b.waiver?.isSigned ? `Form 1 signed by ${signerName}` : `Form 1 signed by ${signerName}`;

  const sessionUrl = checkoutSession?.url || b.payment?.checkoutUrl || '';
  const sessionId = checkoutSession?.id || b.payment?.stripeSessionId || '';

  const lessonPrice = Number(b.pricing?.lessonPrice || 60);
  const bookingFee = Number(b.pricing?.bookingFee || 3);
  const totalAmount = Number(b.pricing?.totalAmount || (lessonPrice + bookingFee));

  return {
    _id: b._id,
    bookingId: b.bookingId || '',
    status: b.status,
    paymentUrl: sessionUrl,
    sessionId: sessionId,
    instructor: {
      _id: b.instructor?._id,
      fullName: b.instructor?.fullName || 'Instructor',
      image: b.instructor?.image || ''
    },
    swimmer: {
      name: swimmerName,
      age: swimmerAge,
      display: swimmerDisplay,
      comfortLevel: comfortLevel
    },
    lesson: {
      type: lessonType,
      date: formattedDate,
      time: timeRange
    },
    location: {
      poolName: b.location?.poolName || '',
      address: b.location?.address || ''
    },
    waiver: {
      isSigned: Boolean(b.waiver?.isSigned ?? true),
      text: waiverText,
      date: waiverSignedDate || '30th July 2026'
    },
    price: {
      lessonPrice,
      bookingFee,
      totalAmount,
      currency: 'USD',
      note: 'Charged now. Nothing to pay at the pool.'
    }
  };
};

/**
 * Format "Booking Confirmed" Screen Payload (Strictly matching Figma 40012199:3699)
 * Strips all unnecessary backend/database fields.
 */
const formatBookingConfirmedResponse = (booking, session = null) => {
  const b = booking.toObject ? booking.toObject() : booking;
  const bDate = parseBookingDate(b.date);
  const daysShort = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const monthsShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  let formattedDate = '';
  let cancellationNotice = '';

  if (bDate && !isNaN(bDate.getTime())) {
    formattedDate = `${daysShort[bDate.getDay()]}, ${monthsShort[bDate.getMonth()]} ${bDate.getDate()}, ${bDate.getFullYear()}`;
    const deadlineDate = new Date(bDate);
    deadlineDate.setDate(deadlineDate.getDate() - 1);
    cancellationNotice = `Free to change or cancel until ${daysShort[deadlineDate.getDay()]}, ${monthsShort[deadlineDate.getMonth()]} ${deadlineDate.getDate()} at ${b.startTime || '10:00 AM'}.`;
  }

  const instructorFullName = b.instructor?.fullName || 'Instructor';
  const instructorFirstName = instructorFullName.trim().split(' ')[0] || 'Instructor';

  const poolName = b.location?.poolName || '';
  const address = b.location?.address || '';
  const fullLocation = poolName && address ? `${poolName}, ${address}` : (poolName || address);
  const mapQuery = encodeURIComponent(fullLocation);

  const durationMin = b.duration || 60;
  const lessonType = b.lessonType || `${durationMin}-min private lesson`;
  const timeRange = b.startTime && b.endTime ? `${b.startTime} – ${b.endTime}` : (b.startTime || '');

  const chatId = b.chat?._id || b.chat || null;

  return {
    _id: b._id,
    bookingId: b.bookingId || '',
    status: b.status,
    paid: true,
    paymentStatus: 'paid',
    header: {
      title: 'Booking confirmed',
      subtitle: `${instructorFirstName} has the details. We’ve emailed you a receipt and added a reminder for the day before.`
    },
    schedule: {
      date: formattedDate,
      time: timeRange
    },
    actions: {
      calendar: {
        title: `${lessonType} with ${instructorFullName}`,
        date: formattedDate,
        startTime: b.startTime || '',
        endTime: b.endTime || '',
        location: fullLocation
      },
      directions: {
        poolName,
        address,
        mapUrl: `https://maps.google.com/?q=${mapQuery}`
      },
      message: {
        chatId,
        instructorId: b.instructor?._id || null,
        instructorName: instructorFirstName,
        buttonText: `Message ${instructorFirstName}`
      }
    },
    cancellationNotice
  };
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
    bookingId: b.bookingId || '',
    status: b.status,
    formattedDate,
    relativeTime,
    lessonTitle: `Private lesson for ${swimmerName}`,
    poolName: b.location?.poolName || b.location?.address || '',
    price: Number(b.pricing?.totalAmount || 0),
    paymentStatus: b.payment?.status || 'unpaid',
    checkoutUrl: b.payment?.checkoutUrl || null,
    paymentUrl: b.payment?.checkoutUrl || null,
    rating: clientReview?.rating || null,
    ratingText: clientReview?.rating ? `You rated ${Number(clientReview.rating).toFixed(1)}` : null,
    instructor: {
      _id: b.instructor?._id,
      fullName: b.instructor?.fullName || 'Instructor',
      image: b.instructor?.image || '/uploads/users/user.jpg'
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
    bookingId: b.bookingId || '',
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
      image: b.client?.image || '/uploads/users/user.jpg'
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
    paymentMethod = 'card',
    paymentIntentId,
    stripePaymentIntentId
  } = payload;

  const effectiveClientId = explicitClientId || authUserId;
  if (!effectiveClientId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Client ID is required');
  }

  if (!instructorId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Instructor ID is required');
  }

  const [clientUser, instructor] = await Promise.all([
    User.findById(effectiveClientId),
    User.findById(instructorId)
  ]);

  if (!instructor || instructor.role !== 'instructor') {
    throw new ApiError(httpStatus.NOT_FOUND, 'Instructor not found');
  }

  // 1. Time Slot Conflict Check (Double-Booking Prevention)
  const resolvedEndTime = resolveEndTime(startTime, endTime, duration);

  if (date && startTime) {
    const conflict = await checkBookingConflict({
      instructorId,
      clientId: effectiveClientId,
      date,
      startTime,
      endTime: resolvedEndTime,
      duration
    });

    if (conflict) {
      throw new ApiError(httpStatus.CONFLICT, conflict.message);
    }

    // Clean up any previous unpaid booking attempts on this slot for this client
    const bookingDate = parseBookingDate(date);
    if (bookingDate) {
      const startOfDay = new Date(bookingDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(bookingDate);
      endOfDay.setHours(23, 59, 59, 999);

      await Booking.deleteMany({
        instructor: instructorId,
        client: effectiveClientId,
        date: { $gte: startOfDay, $lte: endOfDay },
        startTime,
        status: 'pending_payment',
        'payment.status': { $ne: 'paid' }
      });
    }
  }

  // 2. Swimmer Details & Auto-fill for 'myself' (Figma Screen 40012135:754)
  const isMyself = (swimmer?.bookedFor === 'myself') || (!swimmer?.name && !swimmerName);
  let defaultAge = 0;
  if (clientUser?.dob) {
    const birthYear = new Date(clientUser.dob).getFullYear();
    if (!isNaN(birthYear)) defaultAge = Math.max(1, new Date().getFullYear() - birthYear);
  }

  const swimmerObj = {
    bookedFor: swimmer?.bookedFor || (isMyself ? 'myself' : 'someone_else'),
    name: swimmer?.name || swimmerName || (isMyself && clientUser?.fullName ? clientUser.fullName : 'Swimmer'),
    age: Number(swimmer?.age !== undefined ? swimmer.age : (swimmerAge !== undefined ? swimmerAge : defaultAge)),
    comfortLevel: swimmer?.comfortLevel || comfortLevel || 'nervous_beginner',
    notes: swimmer?.notes || notes || ''
  };

  // 3. Location Details
  const locationObj = {
    locationType: location?.locationType || 'public_pool',
    poolName: location?.poolName || poolName || '',
    address: location?.address || address || 'Designated Pool Location',
    location: location?.location || { type: 'Point', coordinates: [0, 0] },
    travelDistance: Number(location?.travelDistance || 0)
  };

  // 4. Liability Waiver (Figma Screen 40012195:700)
  const waiverObj = {
    isSigned: waiver?.isSigned !== undefined ? waiver.isSigned : true,
    signerRelationship: waiver?.signerRelationship || (isMyself ? 'self' : 'parent'),
    legalName: waiver?.legalName || legalName || clientUser?.fullName || 'Parent/Guardian',
    isAgreed: waiver?.isAgreed !== undefined ? waiver.isAgreed : true,
    signedDate: waiver?.signedDate ? new Date(waiver.signedDate) : new Date(),
    waiverVersion: waiver?.waiverVersion || 'v1.0'
  };

  // Calculate pricing breakdown (Figma Screen 40012199:3518)
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

  // 5. Stripe Payment Processing & Checkout Link Generation
  const targetPaymentIntentId = paymentIntentId || stripePaymentIntentId || null;
  let paymentStatus = 'unpaid';
  let verifiedPaymentIntent = null;
  let paidAt = null;
  let initialStatus = 'pending_payment';

  if (targetPaymentIntentId && typeof targetPaymentIntentId === 'string' && targetPaymentIntentId.startsWith('pi_')) {
    try {
      verifiedPaymentIntent = await stripeHelper.retrievePaymentIntent(targetPaymentIntentId);
      if (verifiedPaymentIntent.status === 'succeeded') {
        paymentStatus = 'paid';
        paidAt = new Date();
        initialStatus = 'pending';
      } else if (['processing', 'requires_action', 'requires_capture'].includes(verifiedPaymentIntent.status)) {
        paymentStatus = 'pending';
        initialStatus = 'pending_payment';
      } else {
        paymentStatus = 'unpaid';
        initialStatus = 'pending_payment';
      }
    } catch (stripeErr) {
      console.error('Error verifying Stripe payment intent on booking create:', stripeErr.message);
      paymentStatus = 'unpaid';
      initialStatus = 'pending_payment';
    }
  }

  const booking = await Booking.create({
    client: effectiveClientId,
    instructor: instructorId,
    swimmer: swimmerObj,
    lessonType,
    duration,
    date,
    startTime,
    endTime: resolvedEndTime,
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
      method: paymentMethod || 'stripe',
      status: paymentStatus,
      transactionId: verifiedPaymentIntent?.id || (targetPaymentIntentId || ''),
      paidAt,
      stripePaymentIntentId: verifiedPaymentIntent?.id || (targetPaymentIntentId || ''),
      stripeClientSecret: verifiedPaymentIntent?.client_secret || ''
    },
    status: initialStatus,
    expiresAt
  });

  // Generate Stripe Checkout Session Link if payment not already completed
  let checkoutSession = null;
  if (paymentStatus !== 'paid') {
    try {
      const baseUrl = getBaseUrl(payload.req);
      const successUrl = payload.successUrl || `${baseUrl}/api/v1/booking/payment/success?session_id={CHECKOUT_SESSION_ID}&booking_id=${booking._id}`;
      const cancelUrl = payload.cancelUrl || `${baseUrl}/api/v1/booking/payment/cancel?session_id={CHECKOUT_SESSION_ID}&booking_id=${booking._id}`;

      checkoutSession = await stripeHelper.createCheckoutSession({
        amount: totalAmount,
        currency: 'usd',
        customerEmail: clientUser?.email,
        clientReferenceId: booking._id,
        metadata: {
          bookingId: String(booking._id),
          bookingReference: String(booking.bookingId || ''),
          clientId: String(effectiveClientId),
          instructorId: String(instructorId),
          lessonType: String(lessonType)
        },
        successUrl,
        cancelUrl,
        description: `Swimletes: ${lessonType} for ${swimmerObj.name}`
      });

      booking.payment.stripeSessionId = checkoutSession.id;
      booking.payment.checkoutUrl = checkoutSession.url;
      booking.payment.transactionId = checkoutSession.id;
      if (checkoutSession.payment_intent) {
        booking.payment.stripePaymentIntentId = typeof checkoutSession.payment_intent === 'object'
          ? checkoutSession.payment_intent.id
          : checkoutSession.payment_intent;
      }
      await booking.save();
    } catch (stripeErr) {
      console.error('Error generating Stripe checkout session link on booking create:', stripeErr);
      throw new ApiError(httpStatus.BAD_REQUEST, `Failed to generate Stripe payment link: ${stripeErr.message}`);
    }
  }

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
    .populate('client', 'fullName email image number address')
    .populate('instructor', 'fullName email image number bio address certifications avgRating totalReviews')
    .populate('chat');

  if (populated.payment?.status === 'paid') {
    return formatBookingConfirmedResponse(populated);
  }

  return formatReviewAndPayResponse(populated, checkoutSession);
};

/**
 * Get Bookings by Tab & Role (Clean card responses matching Figma screens)
 */
const getMyBookingsService = async (userId, role, queryParams = {}) => {
  const {
    tab,
    status: statusFilter,
    page = 1,
    limit = 20,
    search
  } = queryParams;

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.max(1, Number(limit) || 20);
  const skip = (pageNum - 1) * limitNum;

  const query = {};

  if (role === 'instructor') {
    query.instructor = userId;
  } else {
    query.client = userId;
  }

  // Process Tab Filters
  const rawTab = String(tab || statusFilter || 'upcoming').toLowerCase().trim();
  const normalizedTab = rawTab;

  if (['upcoming', 'accepted'].includes(normalizedTab)) {
    query.status = 'accepted';
  } else if (normalizedTab === 'active') {
    query.status = 'active';
  } else if (normalizedTab === 'completed') {
    query.status = 'completed';
  } else if (['requests', 'to_confirm', 'requested', 'pending', 'pending_approval'].includes(normalizedTab)) {
    if (role === 'instructor') {
      query.status = 'pending';
    } else {
      query.status = { $in: ['pending', 'pending_payment'] };
    }
  } else if (['unpaid', 'pending_payment'].includes(normalizedTab)) {
    query.status = 'pending_payment';
  } else if (['cancelled', 'declined'].includes(normalizedTab)) {
    query.status = { $in: ['cancelled', 'declined'] };
  } else if (normalizedTab === 'all') {
    if (statusFilter) {
      query.status = statusFilter;
    }
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
  if (['upcoming', 'accepted', 'requests', 'to_confirm', 'requested', 'pending'].includes(normalizedTab)) {
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

  const [pendingCount, acceptedUpcomingCount, activeCount, completedCount, cancelledCount, pendingPaymentCount] = await Promise.all([
    Booking.countDocuments({ ...userQuery, status: 'pending' }),
    Booking.countDocuments({ ...userQuery, status: 'accepted' }),
    Booking.countDocuments({ ...userQuery, status: 'active' }),
    Booking.countDocuments({ ...userQuery, status: 'completed' }),
    Booking.countDocuments({ ...userQuery, status: { $in: ['cancelled', 'declined'] } }),
    Booking.countDocuments({ ...userQuery, status: 'pending_payment' })
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
    requests: pendingCount + pendingPaymentCount,
    unpaid: pendingPaymentCount,
    pending: pendingCount,
    upcoming: acceptedUpcomingCount,
    active: activeCount,
    completed: completedCount,
    toConfirm: pendingCount,
    requested: pendingCount,
    cancelled: cancelledCount,
    total: pendingCount + acceptedUpcomingCount + activeCount + completedCount + cancelledCount + pendingPaymentCount
  };
};

/**
 * Format Member Duration (e.g., "2y", "3mo", "2w", "5d")
 */
const formatMemberDuration = (createdAt) => {
  if (!createdAt) return 'New';
  const created = new Date(createdAt);
  const now = new Date();
  const diffDays = Math.round((now - created) / (1000 * 60 * 60 * 24));
  if (diffDays >= 365) {
    const years = Math.floor(diffDays / 365);
    return `${years}y`;
  }
  if (diffDays >= 30) {
    const months = Math.floor(diffDays / 30);
    return `${months}mo`;
  }
  if (diffDays >= 7) {
    const weeks = Math.floor(diffDays / 7);
    return `${weeks}w`;
  }
  return `${Math.max(1, diffDays)}d`;
};

/**
 * Get Booking Details by ID (Clean database data, matching Figma 40012321:3120, no unnecessary internal fields)
 */
const getBookingByIdService = async (bookingId, userId, userRole) => {
  if (!mongoose.Types.ObjectId.isValid(bookingId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid Booking ID');
  }

  const booking = await Booking.findById(bookingId)
    .populate('client', 'fullName email image number address createdAt avgRating totalReviews ratingCount')
    .populate('instructor', 'fullName email image number bio address certifications avgRating totalReviews ratingCount')
    .populate('clientReview')
    .populate('instructorReview');

  if (!booking) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Booking not found');
  }

  const isClient = booking.client && booking.client._id && userId && booking.client._id.toString() === userId.toString();
  const isInstructor = booking.instructor && booking.instructor._id && userId && booking.instructor._id.toString() === userId.toString();
  const isAdmin = userRole === 'admin';

  if (userId && !isClient && !isInstructor && !isAdmin) {
    throw new ApiError(httpStatus.FORBIDDEN, 'You are not authorized to view this booking');
  }

  const b = booking.toObject ? booking.toObject() : booking;

  // Real client stats from database (if client exists)
  let clientStats = null;
  if (b.client && b.client._id) {
    const [bookedCount, cancelCount] = await Promise.all([
      Booking.countDocuments({ client: b.client._id, status: { $in: ['completed', 'accepted', 'active'] } }),
      Booking.countDocuments({ client: b.client._id, status: 'cancelled' })
    ]);
    clientStats = {
      lessonsBooked: bookedCount,
      cancels: cancelCount,
      memberSince: formatMemberDuration(b.client.createdAt)
    };
  }

  // Real schedule conflict check from database (if instructor exists)
  let scheduleConflict = {
    hasConflict: false,
    title: 'No schedule conflict',
    description: 'No other lessons scheduled for this day'
  };

  if (b.instructor && b.instructor._id && b.date) {
    try {
      const dayStart = new Date(b.date);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(b.date);
      dayEnd.setHours(23, 59, 59, 999);

      const otherBookings = await Booking.find({
        instructor: b.instructor._id,
        _id: { $ne: b._id },
        date: { $gte: dayStart, $lte: dayEnd },
        status: { $in: ['accepted', 'active'] }
      }).sort({ startTime: 1 });

      const conflict = otherBookings.find((ob) => ob.startTime === b.startTime);

      if (conflict) {
        scheduleConflict = {
          hasConflict: true,
          title: 'Schedule conflict detected',
          description: `Conflict with another lesson at ${conflict.startTime} – ${conflict.endTime}`
        };
      } else if (otherBookings.length > 0) {
        const nextBooking = otherBookings[0];
        scheduleConflict = {
          hasConflict: false,
          title: 'No schedule conflict',
          description: `Your other lesson that day is ${nextBooking.startTime} – ${nextBooking.endTime}`
        };
      }
    } catch (err) {
      // Continue cleanly if error checking conflict
    }
  }

  // Format date and time
  const bookingDate = parseBookingDate(b.date);
  const daysShort = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const monthsShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  let formattedDate = '';
  if (bookingDate && !isNaN(bookingDate.getTime())) {
    const dayName = daysShort[bookingDate.getDay()];
    const monthName = monthsShort[bookingDate.getMonth()];
    const dateNum = bookingDate.getDate();
    formattedDate = `${dayName}, ${monthName} ${dateNum} · ${b.startTime || ''}`;
  }

  const lessonSubtitle = b.startTime && b.endTime
    ? `${b.startTime} – ${b.endTime} · ${b.lessonType || '60-min private lesson'}`
    : (b.lessonType || '60-min private lesson');

  const comfortLevelMap = {
    never_been_in_water: 'Never been in water',
    nervous_beginner: 'Nervous Beginner',
    can_float_paddle: 'Can float & paddle',
    swims_confidently: 'Swims Confidently'
  };

  // Expiration countdown for pending booking requests
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

  const parentPays = Number(b.pricing?.totalAmount || 0);
  const youReceive = Number(b.pricing?.instructorEarnings || 0);
  const commissionAmount = Number(b.pricing?.platformCommission || (parentPays - youReceive));
  const commissionPercentage = parentPays > 0 ? Math.round((commissionAmount / parentPays) * 100) : 15;

  const clientRating = Number(b.client?.avgRating || 0);
  const clientReviewCount = Number(b.client?.totalReviews || b.client?.ratingCount || 0);

  const instructorRating = Number(b.instructor?.avgRating || 0);
  const instructorReviewCount = Number(b.instructor?.totalReviews || b.instructor?.ratingCount || 0);

  return {
    _id: b._id,
    bookingId: b.bookingId || '',
    status: b.status,
    formattedDate,
    lessonSubtitle,
    startTime: b.startTime || '',
    endTime: b.endTime || '',
    time: b.startTime && b.endTime ? `${b.startTime} – ${b.endTime}` : (b.startTime || ''),
    lessonType: b.lessonType || '60-min private lesson',
    ...(b.status === 'pending' && expiresIn ? { expiresIn } : {}),
    pricing: {
      parentPays,
      commissionPercentage,
      commissionAmount,
      youReceive
    },
    client: b.client ? {
      _id: b.client._id,
      fullName: b.client.fullName || '',
      image: b.client.image || '',
      rating: clientRating,
      totalReviews: clientReviewCount,
      ratingText: clientReviewCount > 0 ? `${clientRating.toFixed(1)} · rated by ${clientReviewCount} instructor${clientReviewCount === 1 ? '' : 's'}` : 'New client',
      lessonsBooked: clientStats?.lessonsBooked || 0,
      cancels: clientStats?.cancels || 0,
      memberSince: clientStats?.memberSince || 'New'
    } : null,
    ...(userRole === 'user' && b.instructor ? {
      instructor: {
        _id: b.instructor._id,
        fullName: b.instructor.fullName || '',
        image: b.instructor.image || '',
        rating: instructorRating,
        totalReviews: instructorReviewCount,
        ratingText: instructorReviewCount > 0 ? `${instructorRating.toFixed(1)} (${instructorReviewCount} review${instructorReviewCount === 1 ? '' : 's'})` : 'No reviews yet'
      }
    } : {}),
    swimmer: {
      name: b.swimmer?.name || '',
      age: b.swimmer?.age || 0,
      comfortLevel: comfortLevelMap[b.swimmer?.comfortLevel] || b.swimmer?.comfortLevel || '',
      notes: b.swimmer?.notes || ''
    },
    location: {
      poolName: b.location?.poolName || '',
      address: b.location?.address || '',
      coordinates: b.location?.location?.coordinates || []
    },
    payment: {
      method: b.payment?.method || 'card',
      status: b.payment?.status || 'unpaid',
      transactionId: b.payment?.transactionId || '',
      paidAt: b.payment?.paidAt || null,
      stripePaymentIntentId: b.payment?.stripePaymentIntentId || '',
      stripeClientSecret: b.payment?.stripeClientSecret || '',
      stripeRefundId: b.payment?.stripeRefundId || ''
    },
    ...(b.payment?.stripeClientSecret ? {
      stripe: {
        clientSecret: b.payment.stripeClientSecret,
        paymentIntentId: b.payment.stripePaymentIntentId || b.payment.transactionId || '',
        amount: b.pricing?.totalAmount || 0,
        currency: 'usd'
      }
    } : {}),
    scheduleConflict,
    chatId: b.chat?._id || b.chat || null,
    canChat: ['accepted', 'active'].includes(b.status),
    canAccept: b.status === 'pending',
    canDecline: b.status === 'pending',
    canStart: b.status === 'accepted',
    canComplete: b.status === 'active',
    canCancel: ['pending', 'accepted'].includes(b.status)
  };
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

  // Conflict check before accepting: ensure no other lesson has taken this time slot
  const conflict = await checkBookingConflict({
    instructorId: booking.instructor,
    clientId: booking.client,
    date: booking.date,
    startTime: booking.startTime,
    endTime: booking.endTime,
    duration: booking.duration,
    excludeBookingId: booking._id
  });

  if (conflict) {
    throw new ApiError(httpStatus.CONFLICT, conflict.message);
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
  const totalAmount = booking.pricing?.totalAmount || 0;
  booking.refundAmount = totalAmount;

  // Process full Stripe refund if payment was already made
  const paymentIntentId = booking.payment?.stripePaymentIntentId || booking.payment?.transactionId;
  if (
    booking.payment?.status === 'paid' &&
    totalAmount > 0 &&
    paymentIntentId &&
    typeof paymentIntentId === 'string' &&
    paymentIntentId.startsWith('pi_')
  ) {
    try {
      const refund = await stripeHelper.createRefund({
        paymentIntentId,
        amount: totalAmount,
        reason: 'requested_by_customer',
        metadata: {
          bookingId: String(booking._id),
          bookingReference: booking.bookingId || '',
          action: 'instructor_declined'
        }
      });
      booking.payment.stripeRefundId = refund.id;
      booking.payment.status = 'refunded';
    } catch (refundErr) {
      console.error('Error processing Stripe refund on decline:', refundErr.message);
    }
  }

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

  // Process Stripe refund if payment was completed and refundAmount > 0
  const paymentIntentId = booking.payment?.stripePaymentIntentId || booking.payment?.transactionId;
  if (
    booking.payment?.status === 'paid' &&
    refundAmount > 0 &&
    paymentIntentId &&
    typeof paymentIntentId === 'string' &&
    paymentIntentId.startsWith('pi_')
  ) {
    try {
      const refund = await stripeHelper.createRefund({
        paymentIntentId,
        amount: refundAmount,
        reason: 'requested_by_customer',
        metadata: {
          bookingId: String(booking._id),
          bookingReference: booking.bookingId || '',
          cancellationWindow
        }
      });
      booking.payment.stripeRefundId = refund.id;
      booking.payment.status = refundAmount >= (booking.pricing?.totalAmount || 0) ? 'refunded' : 'partially_refunded';
    } catch (refundErr) {
      console.error('Error processing Stripe refund on cancellation:', refundErr.message);
    }
  }

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

/**
 * Create Stripe PaymentIntent for a Booking
 */
const createBookingPaymentIntentService = async (userId, payload = {}) => {
  const {
    amount,
    totalAmount: rawTotalAmount,
    pricing,
    bookingId,
    instructorId,
    currency = 'usd'
  } = payload;

  const clientUser = await User.findById(userId);
  if (!clientUser) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }

  // Determine amount
  let calculatedAmount = Number(amount || rawTotalAmount);
  if (!calculatedAmount && pricing?.totalAmount) {
    calculatedAmount = Number(pricing.totalAmount);
  } else if (!calculatedAmount && pricing?.lessonPrice) {
    const lessonPrice = Number(pricing.lessonPrice);
    const bookingFee = Number(pricing.bookingFee) || +(lessonPrice * 0.05).toFixed(2);
    const poolEntryFee = Number(pricing.poolEntryFee) || 0;
    const travelFee = Number(pricing.travelFee) || 0;
    const discountAmount = Number(pricing.discountAmount) || 0;
    calculatedAmount = +(lessonPrice + bookingFee + poolEntryFee + travelFee - discountAmount).toFixed(2);
  }

  if (!calculatedAmount || calculatedAmount <= 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'A valid payment amount is required');
  }

  let existingBooking = null;
  if (bookingId && mongoose.Types.ObjectId.isValid(bookingId)) {
    existingBooking = await Booking.findById(bookingId);
  }

  if (existingBooking) {
    const conflict = await checkBookingConflict({
      instructorId: existingBooking.instructor,
      clientId: existingBooking.client,
      date: existingBooking.date,
      startTime: existingBooking.startTime,
      endTime: existingBooking.endTime,
      duration: existingBooking.duration,
      excludeBookingId: existingBooking._id
    });

    if (conflict) {
      throw new ApiError(httpStatus.CONFLICT, conflict.message);
    }
  }

  const metadata = {
    clientId: String(userId),
    clientEmail: clientUser.email || '',
    ...(instructorId ? { instructorId: String(instructorId) } : {}),
    ...(existingBooking ? { bookingId: String(existingBooking._id), bookingReference: existingBooking.bookingId || '' } : {})
  };

  const paymentIntent = await stripeHelper.createPaymentIntent({
    amount: calculatedAmount,
    currency,
    receiptEmail: clientUser.email,
    metadata,
    description: `Swimletes Lesson Booking ${existingBooking?.bookingId || ''}`.trim()
  });

  if (existingBooking) {
    existingBooking.payment.stripePaymentIntentId = paymentIntent.id;
    existingBooking.payment.stripeClientSecret = paymentIntent.client_secret;
    existingBooking.payment.transactionId = paymentIntent.id;
    existingBooking.payment.status = 'unpaid';
    await existingBooking.save();
  }

  return {
    clientSecret: paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id,
    amount: calculatedAmount,
    currency: paymentIntent.currency,
    publishableKey: process.env.STRIPE_PK || process.env.STRIPE_PUBLISHABLE_KEY || ''
  };
};

/**
 * Confirm Booking Payment after Stripe Payment Sheet succeeds
 */
const confirmBookingPaymentService = async (bookingId, userId, paymentIntentId = null) => {
  if (!mongoose.Types.ObjectId.isValid(bookingId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid Booking ID');
  }

  const booking = await Booking.findById(bookingId);
  if (!booking) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Booking not found');
  }

  const targetPi = paymentIntentId || booking.payment?.stripePaymentIntentId || booking.payment?.transactionId;
  if (!targetPi) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Payment intent ID is required to confirm payment');
  }

  const paymentIntent = await stripeHelper.retrievePaymentIntent(targetPi);
  if (paymentIntent.status === 'succeeded') {
    // Conflict check before finalizing payment to prevent double booking
    const conflict = await checkBookingConflict({
      instructorId: booking.instructor,
      clientId: booking.client,
      date: booking.date,
      startTime: booking.startTime,
      endTime: booking.endTime,
      duration: booking.duration,
      excludeBookingId: booking._id
    });

    if (conflict) {
      booking.payment.status = 'paid';
      booking.status = 'cancelled';
      booking.cancellationReason = conflict.message;
      await booking.save();

      try {
        await stripeHelper.createRefund({ paymentIntentId: targetPi, reason: 'duplicate' });
        booking.payment.status = 'refunded';
        await booking.save();
      } catch (rfErr) {
        console.warn('Could not auto-refund conflicted booking in confirmBookingPayment:', rfErr.message);
      }

      throw new ApiError(httpStatus.CONFLICT, conflict.message);
    }

    booking.payment.status = 'paid';
    booking.payment.paidAt = new Date();
    booking.payment.transactionId = paymentIntent.id;
    booking.payment.stripePaymentIntentId = paymentIntent.id;
    if (booking.status === 'pending_payment') {
      booking.status = 'pending';
    }
    await booking.save();
  } else if (['processing', 'requires_action', 'requires_capture'].includes(paymentIntent.status)) {
    booking.payment.status = 'pending';
    await booking.save();
  } else {
    booking.payment.status = 'failed';
    await booking.save();
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Payment is not complete. Current Stripe status: ${paymentIntent.status}`
    );
  }

  const populated = await Booking.findById(booking._id)
    .populate('client', 'fullName email image number address')
    .populate('instructor', 'fullName email image number bio address certifications avgRating totalReviews')
    .populate('chat');

  return formatBookingConfirmedResponse(populated);
};

/**
 * Create or re-generate Stripe Checkout Session for a Booking
 */
const createBookingCheckoutSessionService = async (userId, payload = {}) => {
  const { bookingId, successUrl: customSuccessUrl, cancelUrl: customCancelUrl, req } = payload;
  if (!bookingId || !mongoose.Types.ObjectId.isValid(bookingId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Valid Booking ID is required');
  }

  const booking = await Booking.findById(bookingId)
    .populate('client', 'fullName email image')
    .populate('instructor', 'fullName email image');

  if (!booking) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Booking not found');
  }

  if (userId && booking.client?._id && booking.client._id.toString() !== userId.toString()) {
    throw new ApiError(httpStatus.FORBIDDEN, 'You are not authorized to pay for this booking');
  }

  if (booking.payment?.status === 'paid') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'This booking has already been paid');
  }

  // Conflict check before generating checkout session
  const conflict = await checkBookingConflict({
    instructorId: booking.instructor?._id || booking.instructor,
    clientId: booking.client?._id || booking.client,
    date: booking.date,
    startTime: booking.startTime,
    endTime: booking.endTime,
    duration: booking.duration,
    excludeBookingId: booking._id
  });

  if (conflict) {
    throw new ApiError(httpStatus.CONFLICT, conflict.message);
  }

  const totalAmount = Number(booking.pricing?.totalAmount || 0);
  if (!totalAmount || totalAmount <= 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid booking total amount');
  }

  const baseUrl = getBaseUrl(req);
  const successUrl = customSuccessUrl || `${baseUrl}/api/v1/booking/payment/success?session_id={CHECKOUT_SESSION_ID}&booking_id=${booking._id}`;
  const cancelUrl = customCancelUrl || `${baseUrl}/api/v1/booking/payment/cancel?session_id={CHECKOUT_SESSION_ID}&booking_id=${booking._id}`;

  const session = await stripeHelper.createCheckoutSession({
    amount: totalAmount,
    currency: 'usd',
    customerEmail: booking.client?.email,
    clientReferenceId: booking._id,
    metadata: {
      bookingId: String(booking._id),
      bookingReference: String(booking.bookingId || ''),
      clientId: String(booking.client?._id || ''),
      instructorId: String(booking.instructor?._id || ''),
      lessonType: String(booking.lessonType || '')
    },
    successUrl,
    cancelUrl,
    description: `Swimletes Lesson Booking ${booking.bookingId || ''}`.trim()
  });

  booking.payment.stripeSessionId = session.id;
  booking.payment.checkoutUrl = session.url;
  booking.payment.transactionId = session.id;
  if (session.payment_intent) {
    booking.payment.stripePaymentIntentId = typeof session.payment_intent === 'object'
      ? session.payment_intent.id
      : session.payment_intent;
  }
  await booking.save();

  const populated = await Booking.findById(booking._id)
    .populate('client', 'fullName email image')
    .populate('instructor', 'fullName email image');

  return formatReviewAndPayResponse(populated, session);
};

/**
 * Verify Checkout Payment and Confirm Booking upon redirect/API call
 */
const verifyCheckoutPaymentSuccessService = async (sessionId = null, bookingId = null, paymentIntentId = null) => {
  let targetSessionId = sessionId;
  let targetBookingId = bookingId;
  let booking = null;

  if (targetBookingId && mongoose.Types.ObjectId.isValid(targetBookingId)) {
    booking = await Booking.findById(targetBookingId)
      .populate('client', 'fullName email image')
      .populate('instructor', 'fullName email image');
  }

  if (!booking && targetBookingId && typeof targetBookingId === 'string' && targetBookingId.startsWith('SW-')) {
    booking = await Booking.findOne({ bookingId: targetBookingId })
      .populate('client', 'fullName email image')
      .populate('instructor', 'fullName email image');
  }

  if (!booking && targetSessionId) {
    booking = await Booking.findOne({ 'payment.stripeSessionId': targetSessionId })
      .populate('client', 'fullName email image')
      .populate('instructor', 'fullName email image');
  }

  if (!targetSessionId && booking?.payment?.stripeSessionId) {
    targetSessionId = booking.payment.stripeSessionId;
  }

  let session = null;
  let isPaid = false;

  if (targetSessionId) {
    try {
      session = await stripeHelper.retrieveCheckoutSession(targetSessionId);
      isPaid = session.payment_status === 'paid';
    } catch (e) {
      console.warn('Could not retrieve Stripe checkout session:', e.message);
    }
  }

  // If booking wasn't found initially, try looking up via Stripe session metadata
  if (!booking && session) {
    const metaBookingId = session.metadata?.bookingId || session.client_reference_id;
    if (metaBookingId && mongoose.Types.ObjectId.isValid(metaBookingId)) {
      booking = await Booking.findById(metaBookingId)
        .populate('client', 'fullName email image')
        .populate('instructor', 'fullName email image');
    }
    if (!booking && session.metadata?.bookingReference) {
      booking = await Booking.findOne({ bookingId: session.metadata.bookingReference })
        .populate('client', 'fullName email image')
        .populate('instructor', 'fullName email image');
    }
  }

  const piId = paymentIntentId || session?.payment_intent || booking?.payment?.stripePaymentIntentId;
  if (!isPaid && piId) {
    try {
      const piString = typeof piId === 'object' ? piId.id : piId;
      const pi = await stripeHelper.retrievePaymentIntent(piString);
      isPaid = pi.status === 'succeeded';
    } catch (e) {
      console.warn('Could not retrieve Stripe payment intent:', e.message);
    }
  }

  // Also verify if the booking is already recorded as paid in database
  if (!isPaid && booking?.payment?.status === 'paid') {
    isPaid = true;
  }

  if (booking && isPaid) {
    // Double-Booking & Conflict check before confirming payment!
    const conflict = await checkBookingConflict({
      instructorId: booking.instructor?._id || booking.instructor,
      clientId: booking.client?._id || booking.client,
      date: booking.date,
      startTime: booking.startTime,
      endTime: booking.endTime,
      excludeBookingId: booking._id
    });

    if (conflict) {
      booking.payment.status = 'paid';
      booking.status = 'cancelled';
      booking.cancellationReason = conflict.message;
      if (targetSessionId) booking.payment.stripeSessionId = targetSessionId;
      await booking.save();

      // Trigger automatic Stripe refund if possible
      const piId = session?.payment_intent || booking.payment?.stripePaymentIntentId;
      if (piId) {
        try {
          const piString = typeof piId === 'object' ? piId.id : piId;
          await stripeHelper.createRefund({ paymentIntentId: piString, reason: 'duplicate' });
          booking.payment.status = 'refunded';
          await booking.save();
        } catch (rfErr) {
          console.warn('Could not auto-refund conflicted booking:', rfErr.message);
        }
      }

      return {
        _id: booking._id,
        bookingId: booking.bookingId || '',
        paid: false,
        paymentStatus: 'refunded',
        status: 'cancelled',
        hasConflict: true,
        message: 'This time slot was booked by someone else while your payment was processing. Your payment has been refunded. Please select another slot.',
        reason: conflict.message,
        paymentUrl: null
      };
    }

    booking.payment.status = 'paid';
    booking.payment.paidAt = new Date();
    if (targetSessionId) booking.payment.stripeSessionId = targetSessionId;
    if (session?.payment_intent) {
      booking.payment.stripePaymentIntentId = typeof session.payment_intent === 'object'
        ? session.payment_intent.id
        : session.payment_intent;
      booking.payment.transactionId = booking.payment.stripePaymentIntentId;
    } else if (targetSessionId) {
      booking.payment.transactionId = targetSessionId;
    }
    if (booking.status === 'pending_payment') {
      booking.status = 'pending';
    }
    await booking.save();
  }

  if (booking && isPaid) {
    const populated = await Booking.findById(booking._id)
      .populate('client', 'fullName email image number address')
      .populate('instructor', 'fullName email image number bio address certifications avgRating totalReviews')
      .populate('chat');

    return formatBookingConfirmedResponse(populated, session);
  }

  // If Stripe confirmed payment is paid, return success confirmation even if DB record is detached
  if (isPaid) {
    const bookingRef = session?.metadata?.bookingReference || (typeof targetBookingId === 'string' && targetBookingId.startsWith('SW-') ? targetBookingId : '');
    const metaId = session?.metadata?.bookingId || targetBookingId || null;
    const amount = session?.amount_total ? session.amount_total / 100 : undefined;
    const currency = session?.currency || 'usd';
    const txnId = session?.payment_intent
      ? (typeof session.payment_intent === 'object' ? session.payment_intent.id : session.payment_intent)
      : targetSessionId;

    return {
      _id: metaId,
      bookingId: bookingRef,
      status: 'pending',
      paid: true,
      paymentStatus: 'paid',
      amount,
      currency,
      sessionId: targetSessionId || null,
      transactionId: txnId || null,
      header: {
        title: 'Booking confirmed',
        subtitle: 'Payment confirmed via Stripe.'
      },
      message: 'Payment success'
    };
  }

  return {
    _id: booking?._id || targetBookingId || null,
    bookingId: booking?.bookingId || '',
    status: booking?.status || 'pending_payment',
    paid: false,
    paymentStatus: session?.payment_status || booking?.payment?.status || 'unpaid',
    message: 'Payment has not been completed yet.',
    paymentUrl: session?.url || booking?.payment?.checkoutUrl || null,
    sessionId: targetSessionId || null
  };
};

/**
 * Handle Payment Failure or Cancellation
 */
const handlePaymentFailService = async (sessionId = null, bookingId = null, reason = 'Payment cancelled or failed') => {
  let booking = null;

  if (bookingId && mongoose.Types.ObjectId.isValid(bookingId)) {
    booking = await Booking.findById(bookingId)
      .populate('client', 'fullName email image')
      .populate('instructor', 'fullName email image');
  }

  if (!booking && bookingId && typeof bookingId === 'string' && bookingId.startsWith('SW-')) {
    booking = await Booking.findOne({ bookingId })
      .populate('client', 'fullName email image')
      .populate('instructor', 'fullName email image');
  }

  if (!booking && sessionId) {
    booking = await Booking.findOne({ 'payment.stripeSessionId': sessionId })
      .populate('client', 'fullName email image')
      .populate('instructor', 'fullName email image');
  }

  if (booking && booking.payment?.status !== 'paid') {
    booking.payment.status = 'failed';
    await booking.save();
  }

  return {
    success: false,
    _id: booking?._id || bookingId || null,
    bookingId: booking?.bookingId || '',
    status: booking?.status || 'cancelled',
    paymentStatus: booking?.payment?.status || 'failed',
    reason,
    paymentUrl: booking?.payment?.checkoutUrl || null
  };
};

/**
 * Get Review & Pay details for a booking (Figma Node 40012199:3518)
 */
const getBookingReviewDetailsService = async (bookingId, userId = null) => {
  if (!bookingId || !mongoose.Types.ObjectId.isValid(bookingId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Valid Booking ID is required');
  }

  const booking = await Booking.findById(bookingId)
    .populate('client', 'fullName email image')
    .populate('instructor', 'fullName email image');

  if (!booking) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Booking not found');
  }

  return formatReviewAndPayResponse(booking);
};

/**
 * Get Booking Confirmed details for a booking (Figma Node 40012199:3699)
 */
const getBookingConfirmationDetailsService = async (bookingId, userId = null) => {
  if (!bookingId || !mongoose.Types.ObjectId.isValid(bookingId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Valid Booking ID is required');
  }

  const booking = await Booking.findById(bookingId)
    .populate('client', 'fullName email image number address')
    .populate('instructor', 'fullName email image number bio address certifications avgRating totalReviews')
    .populate('chat');

  if (!booking) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Booking not found');
  }

  return formatBookingConfirmedResponse(booking);
};

/**
 * Real-time conflict check service for frontend (GET & POST /api/v1/bookings/check-conflict)
 */
const checkBookingConflictService = async (query = {}, userId = null) => {
  const { instructorId, date, startTime, endTime, duration } = query;
  if (!instructorId || !date || !startTime) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'instructorId, date, and startTime are required');
  }

  const conflict = await checkBookingConflict({
    instructorId,
    clientId: userId,
    date,
    startTime,
    endTime,
    duration: duration ? Number(duration) : 60
  });

  // If booking time collapses (conflicts), throw error message!
  if (conflict && (query.throwOnError === undefined || query.throwOnError === 'true' || query.throwOnError === true)) {
    throw new ApiError(httpStatus.CONFLICT, conflict.message);
  }

  return {
    hasConflict: Boolean(conflict),
    conflict: conflict || null,
    message: conflict ? conflict.message : 'This time slot is available!'
  };
};

/**
 * Handle Stripe Webhook Events
 */
const handleStripeWebhookService = async (rawBody, signature, bodyData = null) => {
  let event;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (webhookSecret && signature && rawBody) {
    try {
      event = stripeHelper.constructWebhookEvent(rawBody, signature, webhookSecret);
    } catch (err) {
      throw new ApiError(httpStatus.BAD_REQUEST, `Webhook Signature Verification Failed: ${err.message}`);
    }
  } else if (bodyData && bodyData.type) {
    event = bodyData;
  } else {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Missing webhook event payload');
  }

  const eventType = event.type;
  const dataObject = event.data?.object;

  switch (eventType) {
    case 'checkout.session.completed': {
      const session = dataObject;
      const bookingId = session.metadata?.bookingId || session.client_reference_id;
      const sessionId = session.id;
      const paymentIntentId = typeof session.payment_intent === 'object'
        ? session.payment_intent?.id
        : session.payment_intent;

      const booking = await Booking.findOne({
        $or: [
          ...(bookingId && mongoose.Types.ObjectId.isValid(bookingId) ? [{ _id: bookingId }] : []),
          { 'payment.stripeSessionId': sessionId },
          ...(paymentIntentId ? [{ 'payment.stripePaymentIntentId': paymentIntentId }, { 'payment.transactionId': paymentIntentId }] : [])
        ]
      });

      if (booking) {
        booking.payment.status = 'paid';
        booking.payment.paidAt = new Date();
        booking.payment.stripeSessionId = sessionId;
        if (paymentIntentId) {
          booking.payment.stripePaymentIntentId = paymentIntentId;
          booking.payment.transactionId = paymentIntentId;
        } else {
          booking.payment.transactionId = sessionId;
        }
        if (booking.status === 'pending_payment') {
          booking.status = 'pending';
        }
        await booking.save();
        console.log(`Booking ${booking.bookingId || booking._id} confirmed and marked as paid via checkout.session.completed webhook`);
      }
      break;
    }

    case 'checkout.session.async_payment_succeeded': {
      const session = dataObject;
      const bookingId = session.metadata?.bookingId || session.client_reference_id;
      const booking = await Booking.findOne({
        $or: [
          ...(bookingId && mongoose.Types.ObjectId.isValid(bookingId) ? [{ _id: bookingId }] : []),
          { 'payment.stripeSessionId': session.id }
        ]
      });
      if (booking) {
        booking.payment.status = 'paid';
        booking.payment.paidAt = new Date();
        if (booking.status === 'pending_payment') {
          booking.status = 'pending';
        }
        await booking.save();
      }
      break;
    }

    case 'checkout.session.async_payment_failed':
    case 'checkout.session.expired': {
      const session = dataObject;
      const bookingId = session.metadata?.bookingId || session.client_reference_id;
      const booking = await Booking.findOne({
        $or: [
          ...(bookingId && mongoose.Types.ObjectId.isValid(bookingId) ? [{ _id: bookingId }] : []),
          { 'payment.stripeSessionId': session.id }
        ]
      });
      if (booking && booking.payment.status === 'unpaid') {
        booking.payment.status = 'failed';
        await booking.save();
      }
      break;
    }

    case 'payment_intent.succeeded': {
      const piId = dataObject.id;
      const booking = await Booking.findOne({
        $or: [
          { 'payment.stripePaymentIntentId': piId },
          { 'payment.transactionId': piId },
          ...(dataObject.metadata?.bookingId && mongoose.Types.ObjectId.isValid(dataObject.metadata.bookingId)
            ? [{ _id: dataObject.metadata.bookingId }]
            : [])
        ]
      });

      if (booking) {
        booking.payment.status = 'paid';
        booking.payment.paidAt = new Date();
        booking.payment.transactionId = piId;
        booking.payment.stripePaymentIntentId = piId;
        if (booking.status === 'pending_payment') {
          booking.status = 'pending';
        }
        await booking.save();
      }
      break;
    }

    case 'payment_intent.payment_failed': {
      const piId = dataObject.id;
      const booking = await Booking.findOne({
        $or: [
          { 'payment.stripePaymentIntentId': piId },
          { 'payment.transactionId': piId }
        ]
      });

      if (booking) {
        booking.payment.status = 'failed';
        await booking.save();
      }
      break;
    }

    case 'charge.refunded': {
      const piId = dataObject.payment_intent;
      if (piId) {
        const booking = await Booking.findOne({
          $or: [
            { 'payment.stripePaymentIntentId': piId },
            { 'payment.transactionId': piId }
          ]
        });

        if (booking) {
          booking.payment.status =
            dataObject.amount_refunded >= dataObject.amount ? 'refunded' : 'partially_refunded';
          await booking.save();
        }
      }
      break;
    }

    default:
      break;
  }

  return { received: true };
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
  adminUpdateBookingStatusService,
  createBookingPaymentIntentService,
  confirmBookingPaymentService,
  createBookingCheckoutSessionService,
  verifyCheckoutPaymentSuccessService,
  handlePaymentFailService,
  handleStripeWebhookService,
  formatReviewAndPayResponse,
  formatBookingConfirmedResponse,
  getBookingReviewDetailsService,
  getBookingConfirmationDetailsService,
  checkBookingConflict,
  checkBookingConflictService
};



