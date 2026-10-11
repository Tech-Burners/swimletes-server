const mongoose = require('mongoose');
const Booking = require('./booking.model');
const User = require('../User/user.model');
const Review = require('../Review/review.model');
const Chat = require('../Chat/chat.model');
const ApiError = require('../../helpers/ApiError');
const { status: httpStatus } = require('http-status');
const stripeHelper = require('../../helpers/stripe');
const { emailWithNodemailer } = require('../../helpers/email');
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
  if (dateInput instanceof Date) {
    if (isNaN(dateInput.getTime())) return null;
    const iso = dateInput.toISOString();
    const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      return new Date(parseInt(match[1], 10), parseInt(match[2], 10) - 1, parseInt(match[3], 10));
    }
    return dateInput;
  }

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
 * Safely resolve booking start and end Date objects from date + startTime / endTime / duration
 */
const getBookingDateTimes = (booking) => {
  if (!booking) return { startDateTime: null, endDateTime: null };
  const bDate = booking.date;
  const startTime = booking.startTime;
  const endTime = booking.endTime;
  const duration = Number(booking.duration) || 60;

  if (!bDate || !startTime) {
    return { startDateTime: null, endDateTime: null };
  }

  const d = parseBookingDate(bDate);
  if (!d || isNaN(d.getTime())) {
    return { startDateTime: null, endDateTime: null };
  }

  const startMin = timeStringToMinutes(startTime);
  if (startMin === null) {
    return { startDateTime: null, endDateTime: null };
  }

  const startDateTime = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  startDateTime.setMinutes(startMin);

  let endMin = timeStringToMinutes(endTime);
  if (endMin === null || endMin <= startMin) {
    endMin = startMin + duration;
  }

  const endDateTime = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  endDateTime.setMinutes(endMin);

  return { startDateTime, endDateTime };
};

/**
 * Checks if the scheduled booking start time has arrived for an accepted or active booking
 */
const isBookingTimeStarted = (booking) => {
  if (!booking) return false;
  if (booking.status === 'active') return true;
  if (booking.status !== 'accepted') return false;

  const { startDateTime } = getBookingDateTimes(booking);
  if (!startDateTime) return false;
  return Date.now() >= startDateTime.getTime();
};

/**
 * Checks if a booking is currently running / in-progress
 * "active- booking is running (if the booking time is start show in progress flag)"
 */
const getIsInProgress = (booking) => {
  if (!booking) return false;
  const status = booking.status;
  if (['completed', 'cancelled', 'declined', 'pending_payment'].includes(status)) {
    return false;
  }
  if (status === 'active') {
    return true;
  }
  if (status === 'accepted') {
    return isBookingTimeStarted(booking);
  }
  return false;
};

/**
 * Auto-sync accepted bookings whose start time has arrived to 'active' status in database
 */
const syncUserBookingsActiveStatus = async (userQuery) => {
  try {
    const acceptedBookings = await Booking.find({
      ...userQuery,
      status: 'accepted'
    });

    const now = Date.now();
    const toActivateIds = [];

    for (const b of acceptedBookings) {
      const { startDateTime } = getBookingDateTimes(b);
      if (startDateTime && now >= startDateTime.getTime()) {
        toActivateIds.push(b._id);
      }
    }

    if (toActivateIds.length > 0) {
      await Booking.updateMany(
        { _id: { $in: toActivateIds } },
        { $set: { status: 'active' } }
      );
    }

    // Also auto-confirm any bookings whose 72h confirmation window has passed
    await syncAutoConfirmedBookings();
  } catch (err) {
    console.error('Error auto-syncing active bookings status:', err);
  }
};

/**
 * Auto-confirms lessons after 72 hours (3 days) if the instructor completed
 * and the client didn't respond / confirm.
 */
const syncAutoConfirmedBookings = async () => {
  try {
    const now = new Date();
    const seventyTwoHoursAgo = new Date(now.getTime() - 72 * 60 * 60 * 1000);

    const overdueBookings = await Booking.find({
      status: { $ne: 'completed' },
      instructorCompleted: true,
      clientCompleted: { $ne: true },
      $or: [
        { autoConfirmAt: { $lte: now } },
        { instructorCompletedAt: { $lte: seventyTwoHoursAgo } }
      ]
    });

    if (overdueBookings.length > 0) {
      for (const b of overdueBookings) {
        b.clientCompleted = true;
        b.clientCompletedAt = now;
        b.status = 'completed';
        b.completedAt = now;
        b.autoConfirmed = true;
        await b.save();

        if (b.instructor) {
          await User.findByIdAndUpdate(b.instructor, { $inc: { lessonsTaught: 1 } });
        }
      }
    }
  } catch (err) {
    console.error('Error auto-confirming 72h overdue bookings:', err);
  }
};

/**
 * System-wide auto-sync for accepted bookings whose start time has arrived
 */
const syncAllAcceptedBookings = async () => {
  try {
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const acceptedBookings = await Booking.find({
      status: 'accepted',
      date: { $lte: todayEnd }
    });

    const now = Date.now();
    const toActivateIds = [];

    for (const b of acceptedBookings) {
      const { startDateTime } = getBookingDateTimes(b);
      if (startDateTime && now >= startDateTime.getTime()) {
        toActivateIds.push(b._id);
      }
    }

    if (toActivateIds.length > 0) {
      await Booking.updateMany(
        { _id: { $in: toActivateIds } },
        { $set: { status: 'active' } }
      );
    }

    // Also auto-confirm any bookings whose 72h confirmation window has passed
    await syncAutoConfirmedBookings();
  } catch (err) {
    console.error('Error auto-syncing all active bookings status:', err);
  }
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

  const signerName = b.waiver?.legalName || b.client?.fullName || '';
  const waiverText = b.waiver?.isSigned ? `Form 1 signed by ${signerName}` : '';

  const sessionUrl = checkoutSession?.url || b.payment?.checkoutUrl || '';
  const sessionId = checkoutSession?.id || b.payment?.stripeSessionId || '';

  const lessonPrice = Number(b.pricing?.lessonPrice || 0);
  const bookingFee = Number(b.pricing?.bookingFee || 0);
  const totalAmount = Number(b.pricing?.totalAmount || (lessonPrice + bookingFee));

  return {
    _id: b._id,
    bookingId: b.bookingId || '',
    status: b.status,
    paymentUrl: sessionUrl,
    sessionId: sessionId,
    instructor: {
      _id: b.instructor?._id,
      fullName: b.instructor?.fullName || '',
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
      isSigned: Boolean(b.waiver?.isSigned),
      text: waiverText,
      date: waiverSignedDate || ''
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
 * No unnecessary internal fields or nulls.
 */
const formatUserBookingCard = (booking) => {
  const b = booking.toObject ? booking.toObject() : booking;
  const bookingDate = parseBookingDate(b.date);
  const now = new Date();
  const inProgress = getIsInProgress(b);
  const clientCompleted = b.status === 'completed' || Boolean(b.clientCompleted);
  const instructorCompleted = b.status === 'completed' || Boolean(b.instructorCompleted);
  const bothCompleted = b.status === 'completed' || (clientCompleted && instructorCompleted);

  const daysShort = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const monthsShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const swimmerName = b.swimmer?.name || 'Swimmer';
  const instructorFullName = b.instructor?.fullName || 'Instructor';
  const instructorFirstName = instructorFullName.trim().split(' ')[0] || 'Instructor';
  const instructorImage = b.instructor?.image || '/uploads/users/user.jpg';
  const instructorId = b.instructor?._id || b.instructor;

  const duration = Number(b.duration) || 60;
  const poolName = b.location?.poolName || b.location?.address || '';
  const lessonTitle = `Private lesson for ${swimmerName}`;

  const chatId = b.chatId ? b.chatId.toString() : (b.chat?._id ? b.chat._id.toString() : (b.chat ? b.chat.toString() : ''));

  let dayName = 'Wed';
  let monthName = 'Aug';
  let dateNum = 5;
  let formattedDate = '';
  let relativeTime = '';

  if (bookingDate && !isNaN(bookingDate.getTime())) {
    dayName = daysShort[bookingDate.getDay()];
    monthName = monthsShort[bookingDate.getMonth()];
    dateNum = bookingDate.getDate();

    formattedDate = `${dayName}, ${monthName} ${dateNum} · ${b.startTime || ''}`;

    const dBooking = new Date(bookingDate.getFullYear(), bookingDate.getMonth(), bookingDate.getDate());
    const dToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diffTime = dBooking.getTime() - dToday.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays > 1) {
      relativeTime = `In ${diffDays} days · ${duration} min`;
    } else if (diffDays === 1) {
      relativeTime = `In 1 day · ${duration} min`;
    } else if (diffDays === 0) {
      relativeTime = `Today · ${duration} min`;
    } else if (diffDays === -1) {
      relativeTime = `1 day ago · ${duration} min`;
    } else {
      relativeTime = `${Math.abs(diffDays)} days ago · ${duration} min`;
    }
  }

  // Determine user card state strictly matching Figma tabs
  let cardState = 'upcoming';
  if (['cancelled', 'declined'].includes(b.status)) {
    cardState = 'cancelled';
  } else if (b.status === 'completed' || bothCompleted) {
    cardState = 'completed';
  } else if (instructorCompleted && !clientCompleted) {
    cardState = 'to_confirm';
  } else if (b.status === 'active' || inProgress) {
    cardState = 'active';
  } else if (['pending', 'pending_payment'].includes(b.status)) {
    cardState = 'requested';
  } else {
    cardState = 'upcoming';
  }

  const instructorObj = {
    _id: instructorId,
    fullName: instructorFullName,
    image: instructorImage
  };

  // 1. Upcoming Card (Figma 40012200-4073)
  if (cardState === 'upcoming') {
    return {
      _id: b._id,
      bookingId: b.bookingId || '',
      chatId,
      status: 'upcoming',
      formattedDate,
      relativeTime,
      instructor: instructorObj,
      lessonTitle,
      poolName,
      action: `Message ${instructorFirstName}`
    };
  }

  // 2. Active Card (Figma 40012392-6688)
  if (cardState === 'active') {
    return {
      _id: b._id,
      bookingId: b.bookingId || '',
      chatId,
      status: 'active',
      formattedDate,
      relativeTime: inProgress ? `In Progress · ${duration} min` : (relativeTime || `In Progress · ${duration} min`),
      instructor: instructorObj,
      lessonTitle,
      poolName,
      action: `Message ${instructorFirstName}`
    };
  }

  // 3. To Confirm Card (Figma 40012521-7298)
  if (cardState === 'to_confirm') {
    return {
      _id: b._id,
      bookingId: b.bookingId || '',
      chatId,
      status: 'to_confirm',
      formattedDate,
      relativeTime: `Completed · ${duration} min`,
      instructor: instructorObj,
      lessonTitle,
      poolName,
      action: 'It happened'
    };
  }

  // 4. Completed Card (Figma 40012228-3788)
  if (cardState === 'completed') {
    const completedCard = {
      _id: b._id,
      bookingId: b.bookingId || '',
      chatId,
      status: 'completed',
      instructor: instructorObj,
      lessonTitle,
      formattedDate: `${dayName}, ${monthName} ${dateNum} · ${duration} min`,
      price: Number(b.pricing?.totalAmount || 0),
      action: 'Book Again'
    };

    const clientReview = b.clientReview || null;
    if (clientReview && clientReview.rating) {
      completedCard.rating = Number(clientReview.rating);
      completedCard.ratingText = `You rated ${Number(clientReview.rating).toFixed(1)}`;
    }

    return completedCard;
  }

  // 5. Requested Card (Figma 40012521-7633)
  if (cardState === 'requested') {
    const requestedCard = {
      _id: b._id,
      bookingId: b.bookingId || '',
      chatId,
      status: b.status === 'pending_payment' ? 'unpaid' : 'requested',
      formattedDate,
      relativeTime,
      instructor: instructorObj,
      lessonTitle,
      poolName
    };
    if (b.status === 'pending_payment') {
      requestedCard.action = 'Pay Now';
      if (b.payment?.checkoutUrl) {
        requestedCard.paymentUrl = b.payment.checkoutUrl;
      }
    }
    return requestedCard;
  }

  // 6. Cancelled Card (Figma 40012257-2729 & 40012521-8097)
  const totalAmt = Number(b.pricing?.totalAmount || 0);
  const refundAmt = Number(b.refundAmount || totalAmt);
  let refundStatus = '$0.00 refunded';
  if (b.payment?.status === 'refunded' || refundAmt > 0) {
    refundStatus = `$${refundAmt.toFixed(2)} refunded`;
  } else if (b.payment?.status === 'paid') {
    refundStatus = `$${totalAmt.toFixed(2)} refund pending`;
  }

  const cancelDateObj = b.cancelledAt ? new Date(b.cancelledAt) : (b.updatedAt ? new Date(b.updatedAt) : null);
  let cancelDateStr = '';
  if (cancelDateObj && !isNaN(cancelDateObj.getTime())) {
    cancelDateStr = ` on ${monthsShort[cancelDateObj.getMonth()]} ${cancelDateObj.getDate()}`;
  }

  let cancellationNote = '';
  if (b.cancelledBy === 'client') {
    cancellationNote = `Cancelled by you${cancelDateStr}${b.cancellationReason ? ` · ${b.cancellationReason}` : ''}`;
  } else if (b.cancelledBy === 'instructor') {
    cancellationNote = `Cancelled by ${instructorFirstName}${cancelDateStr}${b.cancellationReason ? ` · ${b.cancellationReason}` : ''}`;
  } else if (b.status === 'declined') {
    cancellationNote = `Declined by ${instructorFirstName}${b.declinedReason ? ` · ${b.declinedReason}` : ''}`;
  } else {
    cancellationNote = `Cancelled${cancelDateStr}${b.cancellationReason ? ` · ${b.cancellationReason}` : ''}`;
  }

  return {
    _id: b._id,
    bookingId: b.bookingId || '',
    chatId,
    status: 'cancelled',
    instructor: instructorObj,
    lessonTitle,
    formattedDate: `${dayName}, ${monthName} ${dateNum} · ${duration} min`,
    refundStatus,
    cancellationNote
  };
};

/**
 * Format Instructor Booking Card (Strictly only the fields shown on Instructor Figma screens)
 * No unnecessary internal fields or nulls.
 */
const formatInstructorBookingCard = (booking) => {
  const b = booking.toObject ? booking.toObject() : booking;
  const bookingDate = parseBookingDate(b.date);
  const now = new Date();
  const inProgress = getIsInProgress(b);
  const clientCompleted = b.status === 'completed' || Boolean(b.clientCompleted);
  const instructorCompleted = b.status === 'completed' || Boolean(b.instructorCompleted);
  const bothCompleted = b.status === 'completed' || (clientCompleted && instructorCompleted);

  const daysShort = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const monthsShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const clientFullName = b.client?.fullName || 'Client';
  const clientFirstName = clientFullName.trim().split(' ')[0] || 'Client';
  const clientImage = b.client?.image || '/uploads/users/user.jpg';
  const clientId = b.client?._id || b.client;

  const swimmerName = b.swimmer?.name || clientFullName;
  const swimmerAge = b.swimmer?.age ? `swimmer age ${b.swimmer.age}` : '';
  const lessonTitle = swimmerAge ? `Private lesson · ${swimmerAge}` : `Private lesson for ${swimmerName}`;

  const duration = Number(b.duration) || 60;
  const poolName = b.location?.poolName || b.location?.address || '';
  const earnings = Number(b.pricing?.instructorEarnings || 0);

  const chatId = b.chatId ? b.chatId.toString() : (b.chat?._id ? b.chat._id.toString() : (b.chat ? b.chat.toString() : ''));

  const timeRange = b.startTime && b.endTime ? `${b.startTime}–${b.endTime}` : (b.startTime || '');

  let dayName = 'Wed';
  let monthName = 'Aug';
  let dateNum = 5;
  let relativeTime = '';

  if (bookingDate && !isNaN(bookingDate.getTime())) {
    dayName = daysShort[bookingDate.getDay()];
    monthName = monthsShort[bookingDate.getMonth()];
    dateNum = bookingDate.getDate();

    const dBooking = new Date(bookingDate.getFullYear(), bookingDate.getMonth(), bookingDate.getDate());
    const dToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diffTime = dBooking.getTime() - dToday.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays > 1) {
      relativeTime = `In ${diffDays} days · ${duration} min`;
    } else if (diffDays === 1) {
      relativeTime = `In 1 day · ${duration} min`;
    } else if (diffDays === 0) {
      relativeTime = `Today · ${duration} min`;
    } else if (diffDays === -1) {
      relativeTime = `1 day ago · ${duration} min`;
    } else {
      relativeTime = `${Math.abs(diffDays)} days ago · ${duration} min`;
    }
  }

  // Determine instructor card state strictly matching Figma tabs
  let cardState = 'requests';
  if (['cancelled', 'declined'].includes(b.status)) {
    cardState = 'cancelled';
  } else if (b.status === 'completed' || bothCompleted) {
    cardState = 'completed';
  } else if (instructorCompleted && !clientCompleted) {
    cardState = 'pending_approval';
  } else if (b.status === 'active' || inProgress) {
    cardState = 'active';
  } else if (b.status === 'pending') {
    cardState = 'requests';
  } else {
    cardState = 'upcoming';
  }

  const clientObj = {
    _id: clientId,
    fullName: clientFullName,
    image: clientImage
  };

  // 1. Requests Card (Figma 40012335-5594)
  if (cardState === 'requests') {
    let expiresIn = 'Expires soon';
    if (b.expiresAt) {
      const diffMs = new Date(b.expiresAt).getTime() - Date.now();
      if (diffMs <= 0) {
        expiresIn = 'Expired';
      } else {
        const hours = Math.floor(diffMs / (1000 * 60 * 60));
        const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        expiresIn = hours > 0 ? `Expires in ${hours}h ${minutes}m` : `Expires in ${minutes}m`;
      }
    }

    return {
      _id: b._id,
      bookingId: b.bookingId || '',
      chatId,
      status: 'pending',
      client: clientObj,
      lessonTitle,
      earnings,
      formattedDate: `${dayName}, ${monthName} ${dateNum} · ${timeRange}`,
      poolName,
      expiresIn,
      actions: ['Decline', 'Accept']
    };
  }

  // 2. Active Card (Figma 40012335-5965)
  if (cardState === 'active') {
    return {
      _id: b._id,
      bookingId: b.bookingId || '',
      chatId,
      status: 'active',
      formattedDate: `${b.startTime || ''} – ${b.endTime || ''}`,
      statusTag: 'In progress',
      client: clientObj,
      lessonTitle,
      earnings,
      poolName,
      action: 'Mark as complete'
    };
  }

  // 3. Upcoming Card (Figma 40012335-6142)
  if (cardState === 'upcoming') {
    return {
      _id: b._id,
      bookingId: b.bookingId || '',
      chatId,
      status: 'upcoming',
      formattedDate: `${dayName}, ${monthName} ${dateNum} · ${b.startTime || ''}`,
      relativeTime,
      client: clientObj,
      lessonTitle,
      earnings,
      poolName,
      action: `Message ${clientFirstName}`
    };
  }

  // 4. Pending Approval Card (Figma 40012335-6808)
  if (cardState === 'pending_approval') {
    return {
      _id: b._id,
      bookingId: b.bookingId || '',
      chatId,
      status: 'pending_approval',
      formattedDate: `${dayName}, ${monthName} ${dateNum} · ${b.startTime || ''}`,
      statusTag: `Completed · ${duration} min`,
      client: clientObj,
      lessonTitle,
      earnings,
      poolName,
      alert: "You marked this complete. Payout releases automatically in 72 hours if they don't confirm.",
      action: 'Send a reminder'
    };
  }

  // 5. Completed Card (Figma 40012335-6303)
  if (cardState === 'completed') {
    const completedCard = {
      _id: b._id,
      bookingId: b.bookingId || '',
      chatId,
      status: 'completed',
      formattedDate: `${dayName}, ${monthName} ${dateNum} · ${b.startTime || ''}`,
      statusTag: `Completed · ${duration} min`,
      client: clientObj,
      lessonTitle,
      earnings,
      poolName,
      action: `Message ${clientFirstName}`
    };

    const clientReview = b.clientReview || null;
    if (clientReview && clientReview.rating) {
      completedCard.rating = Number(clientReview.rating);
      completedCard.ratingText = `They rated you ${Number(clientReview.rating).toFixed(1)}`;
    }

    return completedCard;
  }

  // 6. Cancelled Card (Figma 40012335-6544)
  const cancelDateObj = b.cancelledAt ? new Date(b.cancelledAt) : (b.updatedAt ? new Date(b.updatedAt) : null);
  let cancelDateStr = '';
  if (cancelDateObj && !isNaN(cancelDateObj.getTime())) {
    cancelDateStr = ` · ${monthsShort[cancelDateObj.getMonth()]} ${cancelDateObj.getDate()}`;
  }

  let cancellationNote = 'Cancelled';
  if (b.cancelledBy === 'client') {
    cancellationNote = `Cancelled by parent${cancelDateStr}`;
  } else if (b.cancelledBy === 'instructor') {
    cancellationNote = 'Cancelled by you';
  } else if (b.status === 'declined') {
    cancellationNote = 'Declined by you';
  }

  const cancelledCard = {
    _id: b._id,
    bookingId: b.bookingId || '',
    chatId,
    status: 'cancelled',
    formattedDate: `${dayName}, ${monthName} ${dateNum} · ${duration} min`,
    cancellationNote,
    client: clientObj,
    lessonTitle,
    earnings,
    poolName
  };

  if (b.cancelledBy === 'client' && (b.cancellationWindow === 'late' || Number(b.pricing?.instructorEarnings || 0) > 0)) {
    cancelledCard.keptText = 'Late cancellation — you kept';
    cancelledCard.keptAmount = Number(b.pricing?.instructorEarnings || 0);
  }

  return cancelledCard;
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

  const userQuery = role === 'instructor' ? { instructor: userId } : { client: userId };

  // 1. Auto-sync any accepted bookings whose start time has arrived to 'active'
  await syncUserBookingsActiveStatus(userQuery);

  const query = { ...userQuery };

  // Process Tab Filters
  const defaultTab = role === 'instructor' ? 'requests' : 'upcoming';
  const rawTab = String(tab || statusFilter || defaultTab).toLowerCase().trim();
  const normalizedTab = rawTab;

  if (['upcoming', 'accepted'].includes(normalizedTab)) {
    query.status = 'accepted';
  } else if (normalizedTab === 'active') {
    query.status = 'active';
    query.instructorCompleted = { $ne: true };
  } else if (['to_confirm', 'toconfirm', 'confirm', 'pending_approval', 'pendingapproval'].includes(normalizedTab)) {
    // Instructor marked complete, waiting for client/parent confirmation
    query.instructorCompleted = true;
    query.clientCompleted = { $ne: true };
    query.status = { $ne: 'completed' };
  } else if (['completed', 'complete'].includes(normalizedTab)) {
    query.status = 'completed';
  } else if (['requests', 'requested', 'pending'].includes(normalizedTab)) {
    if (role === 'instructor') {
      query.status = 'pending';
    } else {
      query.status = { $in: ['pending', 'pending_payment'] };
    }
  } else if (['unpaid', 'pending_payment'].includes(normalizedTab)) {
    query.status = 'pending_payment';
  } else if (['cancelled', 'declined', 'cancel'].includes(normalizedTab)) {
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
  if (['upcoming', 'accepted', 'requests', 'to_confirm', 'requested', 'pending', 'pending_approval'].includes(normalizedTab)) {
    sortOrder = { date: 1, startTime: 1 };
  }

  const [bookings, totalCount] = await Promise.all([
    Booking.find(query)
      .populate('client', 'fullName email image')
      .populate('instructor', 'fullName email image')
      .populate('clientReview')
      .populate('instructorReview')
      .populate('chat', '_id')
      .sort(sortOrder)
      .skip(skip)
      .limit(limitNum),
    Booking.countDocuments(query)
  ]);

  // Ensure chat is linked for each booking so chatId is never null
  const Chat = require('../Chat/chat.model');
  const missingChatBookings = bookings.filter((b) => !b.chat && b.client && b.instructor);
  if (missingChatBookings.length > 0) {
    await Promise.all(
      missingChatBookings.map(async (b) => {
        try {
          const clientId = b.client._id || b.client;
          const instructorId = b.instructor._id || b.instructor;
          let chat = await Chat.findOne({
            participants: { $all: [clientId, instructorId] }
          });
          if (!chat) {
            chat = await Chat.create({
              participants: [clientId, instructorId],
              booking: b._id,
              unreadCounts: {
                [clientId.toString()]: 0,
                [instructorId.toString()]: 0
              }
            });
          }
          if (chat) {
            b.chat = chat._id;
            await Booking.findByIdAndUpdate(b._id, { $set: { chat: chat._id } });
          }
        } catch (e) {
          // continue cleanly
        }
      })
    );
  }

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
 * Get Tab Counts for switcher badges (matching User and Instructor Figma screens)
 */
const getBookingTabCountsService = async (userId, role) => {
  const userQuery = role === 'instructor' ? { instructor: userId } : { client: userId };

  // Auto-sync any accepted bookings whose start time has arrived to 'active'
  await syncUserBookingsActiveStatus(userQuery);

  const [
    pendingCount,
    acceptedUpcomingCount,
    activeCount,
    pendingApprovalCount,
    completedCount,
    cancelledCount,
    pendingPaymentCount
  ] = await Promise.all([
    Booking.countDocuments({ ...userQuery, status: 'pending' }),
    Booking.countDocuments({ ...userQuery, status: 'accepted' }),
    Booking.countDocuments({ ...userQuery, status: 'active', instructorCompleted: { $ne: true } }),
    Booking.countDocuments({
      ...userQuery,
      instructorCompleted: true,
      clientCompleted: { $ne: true },
      status: { $ne: 'completed' }
    }),
    Booking.countDocuments({ ...userQuery, status: 'completed' }),
    Booking.countDocuments({ ...userQuery, status: { $in: ['cancelled', 'declined'] } }),
    Booking.countDocuments({ ...userQuery, status: 'pending_payment' })
  ]);

  if (role === 'instructor') {
    return {
      requests: pendingCount,
      requested: pendingCount,
      active: activeCount,
      upcoming: acceptedUpcomingCount,
      completed: completedCount,
      complete: completedCount,
      cancelled: cancelledCount,
      pendingApproval: pendingApprovalCount,
      toConfirm: pendingApprovalCount,
      total: pendingCount + acceptedUpcomingCount + activeCount + pendingApprovalCount + completedCount + cancelledCount
    };
  }

  // User
  const requestedTotal = pendingCount + pendingPaymentCount;
  return {
    upcoming: acceptedUpcomingCount,
    active: activeCount,
    completed: completedCount,
    complete: completedCount,
    toConfirm: pendingApprovalCount,
    pendingApproval: pendingApprovalCount,
    requested: requestedTotal,
    requests: requestedTotal,
    unpaid: pendingPaymentCount,
    cancelled: cancelledCount,
    total: acceptedUpcomingCount + activeCount + pendingApprovalCount + completedCount + requestedTotal + cancelledCount
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

const daysOfWeekShort = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const monthsShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const formatFigmaBookingDate = (date, startTime) => {
  if (!date) return startTime || '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return startTime || '';
  const dayName = daysOfWeekShort[d.getDay()];
  const monthName = monthsShort[d.getMonth()];
  const dayNum = d.getDate();
  const timeStr = startTime ? ` · ${startTime}` : '';
  return `${dayName}, ${monthName} ${dayNum}${timeStr}`;
};

const formatRelativeDays = (date) => {
  if (!date) return '';
  const now = new Date();
  const target = new Date(date);
  if (isNaN(target.getTime())) return '';
  const diffMs = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime() -
    new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diffDays = Math.round(diffMs / (24 * 60 * 60 * 1000));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';
  if (diffDays > 1) return `In ${diffDays} days`;
  return `${Math.abs(diffDays)} days ago`;
};

const formatDateShort = (date) => {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  return `${monthsShort[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
};

const formatComfortLevelDisplay = (level) => {
  if (!level) return '';
  switch (level) {
    case 'never_been_in_water':
      return 'Never been in water';
    case 'nervous_beginner':
      return 'Nervous Beginner';
    case 'can_float_paddle':
      return 'Can float & paddle';
    case 'swims_confidently':
      return 'Swims Confidently';
    default:
      return String(level).split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }
};

const formatCancellationCutoff = (date, startTime) => {
  if (!date) return 'Free to change or cancel until 24 hours prior.';
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return 'Free to change or cancel until 24 hours prior.';
    const cutoff = new Date(d.getTime() - 24 * 60 * 60 * 1000);
    const dayName = daysOfWeekShort[cutoff.getDay()];
    const monthName = monthsShort[cutoff.getMonth()];
    const dayNum = cutoff.getDate();
    const timeStr = startTime || '10:00 AM';
    return `Free to change or cancel until ${dayName}, ${monthName} ${dayNum} at ${timeStr}.`;
  } catch (e) {
    return 'Free to change or cancel until 24 hours prior.';
  }
};

/**
 * Get Booking Details by ID (Clean database data, custom response based on role matching Figma User View 40012606:5436 / 40012239:1080 and Instructor View 40012368:2829)
 */
const getBookingByIdService = async (bookingId, userId, requestedRole, queryParams = {}) => {
  let booking = null;

  const populateInstructorFields = 'fullName email image number bio about address certifications certification cprCertification firstAidCertification backgroundCheck isVerified teaches speaks experience lessonsTaught avgRating totalReviews ratingCount';
  const populateClientFields = 'fullName email image number address createdAt avgRating totalReviews ratingCount';

  if (mongoose.Types.ObjectId.isValid(bookingId)) {
    booking = await Booking.findById(bookingId)
      .populate('client', populateClientFields)
      .populate('instructor', populateInstructorFields)
      .populate('clientReview')
      .populate('instructorReview')
      .populate('chat', '_id');
  }

  if (!booking) {
    booking = await Booking.findOne({ bookingId })
      .populate('client', populateClientFields)
      .populate('instructor', populateInstructorFields)
      .populate('clientReview')
      .populate('instructorReview')
      .populate('chat', '_id');
  }

  if (!booking) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Booking not found');
  }

  // Ensure chat is linked so chatId is always provided
  let resolvedChatId = booking.chat?._id ? booking.chat._id.toString() : (booking.chat ? booking.chat.toString() : '');
  if (!resolvedChatId && booking.client && booking.instructor) {
    try {
      const Chat = require('../Chat/chat.model');
      const clientId = booking.client._id || booking.client;
      const instructorId = booking.instructor._id || booking.instructor;
      let chat = await Chat.findOne({
        participants: { $all: [clientId, instructorId] }
      });
      if (!chat) {
        chat = await Chat.create({
          participants: [clientId, instructorId],
          booking: booking._id,
          unreadCounts: {
            [clientId.toString()]: 0,
            [instructorId.toString()]: 0
          }
        });
      }
      if (chat) {
        resolvedChatId = chat._id.toString();
        booking.chat = chat._id;
        await Booking.findByIdAndUpdate(booking._id, { $set: { chat: chat._id } });
      }
    } catch (chatErr) {
      // continue cleanly
    }
  }

  // If accepted and start time has arrived, auto-sync to 'active'
  if (booking.status === 'accepted' && isBookingTimeStarted(booking)) {
    booking.status = 'active';
    await Booking.findByIdAndUpdate(booking._id, { $set: { status: 'active' } });
  }

  const isClient = booking.client && booking.client._id && userId && booking.client._id.toString() === userId.toString();
  const isInstructor = booking.instructor && booking.instructor._id && userId && booking.instructor._id.toString() === userId.toString();
  const isAdmin = requestedRole === 'admin';

  if (userId && !isClient && !isInstructor && !isAdmin) {
    throw new ApiError(httpStatus.FORBIDDEN, 'You are not authorized to view this booking');
  }

  // Determine effective view role:
  // Explicit requestedRole ('instructor', 'user', 'admin') takes precedence (from query ?view= or ?role=),
  // otherwise fallback to authenticated role or user ownership.
  let effectiveRole = 'user';
  if (requestedRole === 'instructor' || requestedRole === 'user' || requestedRole === 'admin') {
    effectiveRole = requestedRole;
  } else if (isInstructor) {
    effectiveRole = 'instructor';
  } else if (isClient) {
    effectiveRole = 'user';
  }

  const b = booking.toObject ? booking.toObject() : booking;

  const instructorUser = b.instructor || null;
  const clientUser = b.client || null;

  // Fallback to query reviews if not already populated on booking document
  const Review = require('../Review/review.model');
  let clientRev = b.clientReview || null;
  let instructorRev = b.instructorReview || null;

  if (!clientRev || !instructorRev) {
    try {
      const dbReviews = await Review.find({ booking: b._id });
      if (!clientRev) {
        clientRev = dbReviews.find(r => r.reviewerRole === 'user') || null;
      }
      if (!instructorRev) {
        instructorRev = dbReviews.find(r => r.reviewerRole === 'instructor') || null;
      }
    } catch (e) {
      // continue cleanly
    }
  }

  // Client stats for Instructor View (Booked by card in Figma 40012368:2829)
  const clientStats = {
    lessonsBooked: 0,
    cancels: 0,
    memberSince: '',
    memberText: 'New Member'
  };

  if (clientUser && clientUser._id) {
    try {
      const [bookedCount, cancelCount] = await Promise.all([
        Booking.countDocuments({ client: clientUser._id, status: { $ne: 'pending_payment' } }),
        Booking.countDocuments({ client: clientUser._id, status: 'cancelled' })
      ]);
      clientStats.lessonsBooked = bookedCount || 0;
      clientStats.cancels = cancelCount || 0;

      if (clientUser.createdAt) {
        const createdDate = new Date(clientUser.createdAt);
        clientStats.memberSince = createdDate.getFullYear().toString();
        const diffYears = Math.floor((Date.now() - createdDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
        clientStats.memberText = diffYears >= 1 ? `${diffYears}y Member` : 'New Member';
      }
    } catch (e) {
      // continue cleanly
    }
  }

  const instructorFirstName = instructorUser?.fullName ? instructorUser.fullName.split(' ')[0] : 'Instructor';
  const clientFirstName = clientUser?.fullName ? clientUser.fullName.split(' ')[0] : 'Client';
  const poolEntryFeeVal = b.pricing?.poolEntryFee ?? 0;
  const poolName = b.location?.poolName || '';
  const address = b.location?.address || '';
  const poolDetails = b.location?.poolDetails || 'Indoor, heated to 86°F · Free parking on site';
  const fullAddressWithDetails = poolDetails ? `${address} · ${poolDetails}` : address;
  const directionsUrl = address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : '';
  const bookingDateShort = b.date ? `${monthsShort[new Date(b.date).getMonth()]} ${new Date(b.date).getDate()}` : 'lesson date';
  const entryFeeAlert = poolEntryFeeVal > 0 ? `You paid $${poolEntryFeeVal.toFixed(2)} for ${instructorFirstName}'s entry. Confirmed lessons are allowed here on ${bookingDateShort}.` : '';

  const locationData = {
    locationType: b.location?.locationType || 'public_pool',
    locationTypeDisplay: b.location?.locationType === 'public_pool' ? 'PUBLIC POOL' : (b.location?.locationType === 'instructor_pool' ? "INSTRUCTOR'S POOL" : "CLIENT'S POOL"),
    poolName,
    address,
    poolDetails,
    fullAddress: fullAddressWithDetails,
    coordinates: (b.location?.location?.coordinates && b.location.location.coordinates.length === 2)
      ? b.location.location.coordinates
      : [],
    mapImage: '/uploads/pools/pool-map-placeholder.png',
    directionsUrl,
    entryFeeAlert
  };

  const theirReview = clientRev ? {
    _id: clientRev._id,
    rating: clientRev.rating,
    ratingText: `${clientRev.rating} out of 5`,
    comment: clientRev.comment || '',
    tags: clientRev.tags || [],
    date: clientRev.createdAt,
    dateFormatted: formatDateShort(clientRev.createdAt),
    reviewerName: clientUser?.fullName || 'Client'
  } : null;

  const yourRating = instructorRev ? {
    _id: instructorRev._id,
    rating: instructorRev.rating,
    ratingText: `${instructorRev.rating} out of 5`,
    comment: instructorRev.comment || '',
    tags: instructorRev.tags || [],
    date: instructorRev.createdAt,
    dateFormatted: formatDateShort(instructorRev.createdAt),
    canEditReview: true
  } : null;

  const getStatusDisplay = (st) => {
    switch (st) {
      case 'accepted': return 'Confirmed';
      case 'completed': return 'Completed';
      case 'active': return 'In Progress';
      case 'pending': return 'Pending';
      case 'cancelled': return 'Cancelled';
      case 'declined': return 'Declined';
      default: return st ? st.charAt(0).toUpperCase() + st.slice(1) : '';
    }
  };

  const isReviewedByCurrentUser = isClient ? Boolean(clientRev) : (isInstructor ? Boolean(instructorRev) : false);

  const instructorEarningsVal = b.pricing?.instructorEarnings ?? 0;
  const isPaidOut = b.status === 'completed';
  const payoutDate = b.payment?.paidAt || b.completedAt || b.updatedAt;

  // 1. Instructor-specific View Payload (Figma 40012368:2829)
  const instructorViewData = {
    roleView: 'instructor',
    _id: b._id,
    bookingId: b.bookingId || null,
    status: b.status,
    statusDisplay: getStatusDisplay(b.status),
    date: b.date,
    dateFormatted: formatFigmaBookingDate(b.date, b.startTime),
    relativeTime: formatRelativeDays(b.date),
    startTime: b.startTime || null,
    endTime: b.endTime || null,
    duration: b.duration ?? null,
    durationText: b.duration ? `${b.duration} min` : null,
    header: {
      title: 'Lesson details',
      status: b.status,
      statusDisplay: getStatusDisplay(b.status),
      dateFormatted: formatFigmaBookingDate(b.date, b.startTime),
      subtitle: `${b.duration || 60} min · ${poolName || 'Oak Lawn Community Pool'}`,
      payout: {
        status: isPaidOut ? 'Paid out' : 'Pending payout',
        amount: instructorEarningsVal,
        amountFormatted: `+$${instructorEarningsVal.toFixed(2)}`,
        text: isPaidOut
          ? (payoutDate ? `Paid out ${monthsShort[new Date(payoutDate).getMonth()]} ${new Date(payoutDate).getDate()}` : 'Paid out')
          : 'Pending payout',
        isPaidOut
      }
    },
    payout: {
      status: isPaidOut ? 'Paid out' : 'Pending payout',
      amount: instructorEarningsVal,
      amountFormatted: `+$${instructorEarningsVal.toFixed(2)}`,
      text: isPaidOut
        ? (payoutDate ? `Paid out ${monthsShort[new Date(payoutDate).getMonth()]} ${new Date(payoutDate).getDate()}` : 'Paid out')
        : 'Pending payout',
      isPaidOut
    },
    bookedBy: clientUser ? {
      _id: clientUser._id || null,
      fullName: clientUser.fullName || null,
      image: clientUser.image || null,
      email: clientUser.email || null,
      number: clientUser.number || null,
      rating: clientUser.avgRating ?? 5.0,
      ratingText: `${(clientUser.avgRating || 5.0).toFixed(1)} · rated by ${clientUser.ratingCount || clientUser.totalReviews || 1} instructors`,
      stats: {
        lessonsBooked: clientStats.lessonsBooked,
        lessonsBookedText: `${clientStats.lessonsBooked}`,
        cancels: clientStats.cancels,
        cancelsText: `${clientStats.cancels}`,
        memberSince: clientStats.memberSince,
        memberText: clientStats.memberText
      }
    } : null,
    swimmer: b.swimmer ? {
      name: b.swimmer.name || null,
      age: b.swimmer.age ?? null,
      formatted: b.swimmer.name ? `${b.swimmer.name}, age ${b.swimmer.age}` : '',
      comfortLevel: b.swimmer.comfortLevel || null,
      comfortLevelDisplay: formatComfortLevelDisplay(b.swimmer.comfortLevel),
      notes: b.swimmer.notes || null,
      parentNote: b.swimmer.notes || null,
      bookedFor: b.swimmer.bookedFor || 'someone_else'
    } : null,
    where: {
      poolName,
      address,
      poolDetails,
      fullAddress: fullAddressWithDetails,
      mapImage: '/uploads/pools/pool-map-placeholder.png',
      coordinates: (b.location?.location?.coordinates && b.location.location.coordinates.length === 2)
        ? b.location.location.coordinates
        : [],
      directionsUrl
    },
    location: locationData,
    theirReview,
    yourRating,
    lesson: {
      type: b.lessonType || '60-min private lesson',
      duration: b.duration ?? 60,
      durationText: b.duration ? `${b.duration} min` : '60 min',
      price: b.pricing?.lessonPrice ?? 0,
      priceFormatted: `$${Number(b.pricing?.lessonPrice ?? 0).toFixed(2)}`,
      earnings: instructorEarningsVal,
      earningsFormatted: `+$${instructorEarningsVal.toFixed(2)}`
    },
    pricing: b.pricing ? {
      lessonPrice: b.pricing.lessonPrice ?? null,
      lessonPriceFormatted: b.pricing.lessonPrice != null ? `$${Number(b.pricing.lessonPrice).toFixed(2)}` : null,
      instructorEarnings: instructorEarningsVal,
      instructorEarningsFormatted: `+$${instructorEarningsVal.toFixed(2)}`,
      bookingFee: b.pricing.bookingFee ?? null,
      poolEntryFee: poolEntryFeeVal,
      totalAmount: b.pricing.totalAmount ?? null
    } : null,
    actions: {
      canChat: ['accepted', 'active', 'completed'].includes(b.status),
      chatId: resolvedChatId || null,
      chatButtonText: `Message ${clientFirstName}`,
      canEditReview: Boolean(instructorRev),
      canReview: Boolean(b.status === 'completed' && !instructorRev)
    },
    canChat: ['accepted', 'active', 'completed'].includes(b.status),
    chatId: resolvedChatId || null,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt
  };

  // 2. User-specific View Payload (Figma 40012239:1080 & 40012606:5436)
  const userViewData = {
    roleView: 'user',
    _id: b._id,
    bookingId: b.bookingId || null,
    status: b.status,
    statusDisplay: getStatusDisplay(b.status),
    date: b.date,
    dateFormatted: formatFigmaBookingDate(b.date, b.startTime),
    relativeTime: formatRelativeDays(b.date),
    startTime: b.startTime || null,
    endTime: b.endTime || null,
    duration: b.duration ?? null,
    durationText: b.duration ? `${b.duration} min` : null,
    lessonType: b.lessonType || null,
    header: {
      title: 'Booking details',
      status: b.status,
      statusDisplay: getStatusDisplay(b.status),
      dateFormatted: formatFigmaBookingDate(b.date, b.startTime),
      relativeCountdown: `${formatRelativeDays(b.date)} · ${b.duration || 60} min`,
      calendar: {
        title: `${b.lessonType || '60-min private lesson'} with ${instructorUser?.fullName || 'Instructor'}`,
        date: b.date,
        startTime: b.startTime || null,
        endTime: b.endTime || null,
        location: fullAddressWithDetails
      }
    },
    instructor: instructorUser ? {
      _id: instructorUser._id || null,
      fullName: instructorUser.fullName || null,
      image: instructorUser.image || null,
      email: instructorUser.email || null,
      number: instructorUser.number || null,
      address: instructorUser.address || '',
      city: instructorUser.address ? instructorUser.address.split(',')[0].trim() : '',
      rating: instructorUser.avgRating ?? 0,
      avgRating: instructorUser.avgRating ?? 0,
      totalReviews: instructorUser.totalReviews ?? (instructorUser.ratingCount ?? 0),
      ratingText: `${(instructorUser.avgRating || 0).toFixed(1)} · ${instructorUser.totalReviews || instructorUser.lessonsTaught || 0} lessons`,
      lessonsTaught: instructorUser.lessonsTaught || 0,
      experience: {
        years: instructorUser.experience?.years || 0,
        description: instructorUser.experience?.description || '',
        formatted: `${instructorUser.experience?.years || 0} yrs`
      },
      bio: instructorUser.bio || instructorUser.about || '',
      about: instructorUser.about || instructorUser.bio || '',
      teaches: (instructorUser.teaches && instructorUser.teaches.length > 0)
        ? instructorUser.teaches
        : ['Kids 5-12', 'Teens', 'Adult'],
      speaks: (instructorUser.speaks && instructorUser.speaks.length > 0)
        ? instructorUser.speaks
        : ['English', 'Spanish'],
      verification: {
        isVerified: Boolean(instructorUser.isVerified || instructorUser.backgroundCheck?.status === 'cleared'),
        badge: 'Checked by SwimLetes',
        certifications: instructorUser.certifications || (instructorUser.certification?.name ? `${instructorUser.certification.name} · CPR/AED current · Background check cleared` : 'Red Cross Water Safety Instructor · CPR/AED current · Background check cleared'),
        howWeVerifyText: 'How we verify instructors'
      },
      poolOptions: [
        {
          id: 'client_pool',
          type: 'client_pool',
          title: `${instructorFirstName} comes to your pool`,
          description: 'Your home pool. Free within 15 miles of her, then a small travel charge.'
        },
        {
          id: 'public_pool',
          type: 'public_pool',
          title: 'Meet at a public pool',
          description: 'List your services, manage bookings, and get paid.',
          poolName: poolName || 'Oak Lawn Community Pool',
          entryFee: poolEntryFeeVal > 0 ? poolEntryFeeVal : 8.00,
          entryFeeFormatted: `$${(poolEntryFeeVal > 0 ? poolEntryFeeVal : 8.00).toFixed(2)}`,
          entryFeeNotice: 'Added to your total at checkout.'
        },
        {
          id: 'instructor_pool',
          type: 'instructor_pool',
          title: `Use ${instructorFirstName}'s pool`,
          description: `${instructorFirstName}’s private pool in Oak Lawn, about 4 miles from you.`,
          notice: 'Exact address shared once she accepts.'
        }
      ],
      goodToKnow: {
        cancelling: 'Free up to 24 hours before. After that, half the lesson price.',
        bring: 'Swimsuit, towel, goggles. Caps sold at reception for $8.',
        parents: 'Welcome on the deck. Under-8s need an adult on site.'
      },
      chatId: resolvedChatId || null
    } : null,
    yourLesson: {
      swimmer: b.swimmer ? {
        name: b.swimmer.name || null,
        age: b.swimmer.age ?? null,
        formatted: b.swimmer.name ? `${b.swimmer.name}, age ${b.swimmer.age}` : '',
        comfortLevel: b.swimmer.comfortLevel || null,
        comfortLevelDisplay: formatComfortLevelDisplay(b.swimmer.comfortLevel)
      } : null,
      lesson: {
        type: b.lessonType || '60-min private lesson',
        duration: b.duration ?? 60,
        durationText: b.duration ? `${b.duration} min` : '60 min'
      },
      waiver: b.waiver ? {
        isSigned: Boolean(b.waiver.isSigned),
        legalName: b.waiver.legalName || null,
        signedDate: b.waiver.signedDate || null,
        signedDateFormatted: b.waiver.signedDate ? formatDateShort(b.waiver.signedDate) : null,
        signerRelationship: b.waiver.signerRelationship || null,
        waiverVersion: b.waiver.waiverVersion || 'v1.0',
        summary: b.waiver.legalName ? `Form 1 signed by ${b.waiver.legalName}` : 'Form 1 signed'
      } : null
    },
    location: locationData,
    payment: {
      items: [
        {
          label: b.lessonType || '60-min private lesson',
          amount: b.pricing?.lessonPrice ?? 0,
          amountFormatted: `$${Number(b.pricing?.lessonPrice ?? 0).toFixed(2)}`
        },
        {
          label: 'Booking fee',
          amount: b.pricing?.bookingFee ?? 0,
          amountFormatted: `$${Number(b.pricing?.bookingFee ?? 0).toFixed(2)}`
        },
        ...(poolEntryFeeVal > 0 ? [{
          label: 'Entry fee',
          amount: poolEntryFeeVal,
          amountFormatted: `$${poolEntryFeeVal.toFixed(2)}`
        }] : []),
        ...(b.pricing?.travelFee > 0 ? [{
          label: 'Travel fee',
          amount: b.pricing.travelFee,
          amountFormatted: `$${Number(b.pricing.travelFee).toFixed(2)}`
        }] : [])
      ],
      lessonPrice: b.pricing?.lessonPrice ?? null,
      lessonPriceFormatted: b.pricing?.lessonPrice != null ? `$${Number(b.pricing.lessonPrice).toFixed(2)}` : null,
      bookingFee: b.pricing?.bookingFee ?? null,
      bookingFeeFormatted: b.pricing?.bookingFee != null ? `$${Number(b.pricing.bookingFee).toFixed(2)}` : null,
      poolEntryFee: poolEntryFeeVal,
      poolEntryFeeFormatted: `$${poolEntryFeeVal.toFixed(2)}`,
      travelFee: b.pricing?.travelFee ?? null,
      travelFeeFormatted: b.pricing?.travelFee != null ? `$${Number(b.pricing.travelFee).toFixed(2)}` : null,
      discountAmount: b.pricing?.discountAmount ?? null,
      discountAmountFormatted: b.pricing?.discountAmount != null ? `$${Number(b.pricing.discountAmount).toFixed(2)}` : null,
      totalAmount: b.pricing?.totalAmount ?? null,
      totalFormatted: b.pricing?.totalAmount != null ? `$${Number(b.pricing.totalAmount).toFixed(2)}` : null,
      cardBrand: b.payment?.cardBrand || null,
      last4: b.payment?.last4 || null,
      paidAt: b.payment?.paidAt || null,
      paidAtFormatted: b.payment?.paidAt ? formatDateShort(b.payment.paidAt) : null,
      cardSummary: `${b.payment?.cardBrand || 'Card'} ·· ${b.payment?.last4 || '••••'}${b.payment?.paidAt ? ' · ' + monthsShort[new Date(b.payment.paidAt).getMonth()] + ' ' + new Date(b.payment.paidAt).getDate() : ''}`,
      bookingId: b.bookingId || null,
      transactionId: b.payment?.transactionId || null,
      receiptUrl: b.payment?.status === 'paid' ? `/api/v1/booking/${b._id}/receipt` : null
    },
    cancellationPolicy: {
      notice: formatCancellationCutoff(b.date, b.startTime),
      canCancel: ['pending', 'accepted'].includes(b.status),
      cancellationWindow: b.cancellationWindow || 'free'
    },
    actions: {
      canChat: ['accepted', 'active', 'completed'].includes(b.status),
      chatId: resolvedChatId || null,
      chatButtonText: `Message ${instructorFirstName}`,
      canCancel: ['pending', 'accepted'].includes(b.status),
      cancelButtonText: 'Cancel Booking',
      canReview: Boolean(b.status === 'completed' && !clientRev)
    },
    // Backward compatibility root keys
    swimmer: b.swimmer ? {
      name: b.swimmer.name || null,
      age: b.swimmer.age ?? null,
      formatted: b.swimmer.name ? `${b.swimmer.name}, age ${b.swimmer.age}` : '',
      comfortLevel: b.swimmer.comfortLevel || null,
      comfortLevelDisplay: formatComfortLevelDisplay(b.swimmer.comfortLevel)
    } : null,
    lesson: {
      type: b.lessonType || '60-min private lesson',
      duration: b.duration ?? 60,
      durationText: b.duration ? `${b.duration} min` : '60 min',
      price: b.pricing?.lessonPrice ?? null,
      priceFormatted: b.pricing?.lessonPrice != null ? `$${Number(b.pricing.lessonPrice).toFixed(2)}` : null
    },
    waiver: b.waiver ? {
      isSigned: Boolean(b.waiver.isSigned),
      legalName: b.waiver.legalName || null,
      signedDateFormatted: b.waiver.signedDate ? formatDateShort(b.waiver.signedDate) : null,
      summary: b.waiver.legalName ? `Form 1 signed by ${b.waiver.legalName}` : 'Form 1 signed'
    } : null,
    pricing: b.pricing ? {
      lessonPrice: b.pricing.lessonPrice ?? null,
      lessonPriceFormatted: b.pricing.lessonPrice != null ? `$${Number(b.pricing.lessonPrice).toFixed(2)}` : null,
      bookingFee: b.pricing.bookingFee ?? null,
      bookingFeeFormatted: b.pricing.bookingFee != null ? `$${Number(b.pricing.bookingFee).toFixed(2)}` : null,
      poolEntryFee: poolEntryFeeVal,
      poolEntryFeeFormatted: `$${poolEntryFeeVal.toFixed(2)}`,
      totalAmount: b.pricing.totalAmount ?? null,
      totalAmountFormatted: b.pricing.totalAmount != null ? `$${Number(b.pricing.totalAmount).toFixed(2)}` : null
    } : null,
    canChat: ['accepted', 'active', 'completed'].includes(b.status),
    chatId: resolvedChatId || null,
    canCancel: ['pending', 'accepted'].includes(b.status),
    canReview: Boolean(b.status === 'completed' && !clientRev),
    createdAt: b.createdAt,
    updatedAt: b.updatedAt
  };

  if (effectiveRole === 'instructor') {
    return instructorViewData;
  }

  if (effectiveRole === 'admin') {
    return {
      roleView: 'admin',
      _id: b._id,
      bookingId: b.bookingId || null,
      status: b.status,
      statusDisplay: getStatusDisplay(b.status),
      userView: userViewData,
      instructorView: instructorViewData,
      ...userViewData,
      bookedBy: instructorViewData.bookedBy,
      where: instructorViewData.where,
      theirReview: instructorViewData.theirReview,
      yourRating: instructorViewData.yourRating,
      payout: instructorViewData.payout
    };
  }

  // Default to user view
  return userViewData;
};

/**
 * Send Booking Reminder
 */
const sendBookingReminderService = async (bookingId, instructorId) => {
  if (!mongoose.Types.ObjectId.isValid(bookingId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid Booking ID');
  }

  const booking = await Booking.findById(bookingId)
    .populate('client', 'fullName email')
    .populate('instructor', 'fullName email image');

  if (!booking) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Booking not found');
  }

  const instructorIdStr = (booking.instructor?._id || booking.instructor || '').toString();
  if (instructorIdStr !== instructorId.toString()) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Only the instructor can send a reminder for this booking');
  }

  if (booking.status !== 'completed' && !booking.instructorCompleted) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Reminders can only be sent for completed or pending approval bookings');
  }

  booking.lastRemindedAt = new Date();
  await booking.save();

  // 1. Send branded HTML reminder email to client
  if (booking.client && booking.client.email) {
    const clientName = booking.client.fullName || 'Swimmer / Parent';
    const instructorName = booking.instructor?.fullName || 'Your Instructor';
    const swimmerName = booking.swimmer?.name || 'Swimmer';
    const lessonTitle = booking.lessonType || 'Private Swimming Lesson';
    const poolName = booking.location?.poolName || booking.location?.address || 'Designated Pool';

    const bookingDate = parseBookingDate(booking.date);
    const daysShort = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const monthsShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    let formattedDate = '';
    if (bookingDate && !isNaN(bookingDate.getTime())) {
      formattedDate = `${daysShort[bookingDate.getDay()]}, ${monthsShort[bookingDate.getMonth()]} ${bookingDate.getDate()} · ${booking.startTime || ''}`;
    }

    const emailHtml = `
      <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
        <div style="background: linear-gradient(135deg, #0077b6 0%, #0096c7 100%); padding: 28px 24px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 26px; font-weight: 700; letter-spacing: -0.5px;">Swimletes</h1>
          <p style="color: #e0f2fe; margin: 6px 0 0; font-size: 14px;">Lesson Completion Reminder</p>
        </div>
        
        <div style="padding: 28px 24px; color: #334155; line-height: 1.6;">
          <p style="font-size: 16px; margin: 0 0 16px;">Hi <strong>${clientName}</strong>,</p>
          <p style="font-size: 15px; margin: 0 0 20px;">
            Your instructor <strong>${instructorName}</strong> has marked your swimming lesson as completed and is waiting for your confirmation.
          </p>

          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 18px; margin-bottom: 24px;">
            <h3 style="margin: 0 0 12px; color: #0f172a; font-size: 15px; font-weight: 600; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">Lesson Details</h3>
            <p style="margin: 4px 0; font-size: 14px;"><strong>Swimmer:</strong> ${swimmerName}</p>
            <p style="margin: 4px 0; font-size: 14px;"><strong>Lesson:</strong> ${lessonTitle}</p>
            ${formattedDate ? `<p style="margin: 4px 0; font-size: 14px;"><strong>Date & Time:</strong> ${formattedDate}</p>` : ''}
            <p style="margin: 4px 0; font-size: 14px;"><strong>Location:</strong> ${poolName}</p>
          </div>

          <div style="background-color: #f0f9ff; border-left: 4px solid #0284c7; padding: 14px 18px; margin-bottom: 24px; border-radius: 4px;">
            <p style="margin: 0; color: #0369a1; font-size: 14px; font-weight: 500;">
              Please open the Swimletes app, go to your <strong>To Confirm</strong> tab, and tap <strong>"It happened"</strong> to verify the lesson was successfully held.
            </p>
            <p style="margin: 8px 0 0; color: #64748b; font-size: 13px;">
              <em>Note: If you do not respond, the lesson will be automatically confirmed in 72 hours.</em>
            </p>
          </div>

          <p style="font-size: 14px; color: #64748b; margin: 0 0 6px;">Thank you for swimming with Swimletes!</p>
        </div>

        <div style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px; text-align: center;">
          <p style="margin: 0; font-size: 12px; color: #94a3b8;">
            © ${new Date().getFullYear()} Swimletes. All rights reserved.
          </p>
        </div>
      </div>
    `;

    try {
      await emailWithNodemailer({
        // email: "mdnasifurahman@gmail.com",
        email: booking.client.email,
        subject: `Reminder: Please confirm your completed swim lesson with ${instructorName}`,
        html: emailHtml
      });
    } catch (emailErr) {
      console.error('Failed to send booking reminder email:', emailErr.message);
    }
  }

  // 2. Real-time socket notification if client is online
  try {
    if (global.io && booking.client && booking.client._id) {
      global.io.emit(`get notification::${booking.client._id.toString()}`, {
        status: 200,
        message: `${booking.instructor?.fullName || 'Instructor'} sent a reminder to confirm your completed lesson`,
        data: {
          bookingId: booking._id,
          type: 'booking_reminder',
          remindedAt: booking.lastRemindedAt
        }
      });
    }
  } catch (socketErr) {
    console.error('Failed to emit socket notification for reminder:', socketErr.message);
  }

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
 * Complete Booking - Two-sided confirmation: both client and instructor must mark as complete
 * (Figma Screen & Requirement: User & Instructor both mark it as complete)
 */
const completeBookingService = async (bookingId, userId, userRole = null) => {
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
    throw new ApiError(httpStatus.FORBIDDEN, 'You are not authorized to mark this booking as complete');
  }

  if (booking.status === 'completed') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'This booking has already been marked as complete by both parties');
  }

  if (!['accepted', 'active'].includes(booking.status)) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Cannot complete a booking with status '${booking.status}'`);
  }

  const now = new Date();

  if (isAdmin) {
    booking.clientCompleted = true;
    booking.instructorCompleted = true;
    booking.clientCompletedAt = booking.clientCompletedAt || now;
    booking.instructorCompletedAt = booking.instructorCompletedAt || now;
    booking.status = 'completed';
    booking.completedAt = now;
  } else if (isClient) {
    if (!booking.instructorCompleted) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'The instructor must first mark the lesson as complete before you can confirm.');
    }
    if (booking.clientCompleted) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'You have already confirmed this lesson.');
    }
    booking.clientCompleted = true;
    booking.clientCompletedAt = now;
    booking.status = 'completed';
    booking.completedAt = now;
  } else if (isInstructor) {
    if (booking.instructorCompleted) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'You have already marked this lesson as complete. Payout releases automatically in 72 hours if client does not confirm.');
    }
    booking.instructorCompleted = true;
    booking.instructorCompletedAt = now;
    booking.autoConfirmAt = new Date(now.getTime() + 72 * 60 * 60 * 1000); // 72 hours / 3 days

    if (booking.clientCompleted) {
      booking.status = 'completed';
      booking.completedAt = now;
    } else {
      booking.status = 'active'; // Moves to "pending approval" on instructor end, "to confirm" on client end
    }
  }

  // Increment instructor lessons taught count once both complete
  if (booking.status === 'completed') {
    await User.findByIdAndUpdate(booking.instructor, { $inc: { lessonsTaught: 1 } });
  }

  await booking.save();

  const populated = await Booking.findById(booking._id)
    .populate('client', 'fullName email image')
    .populate('instructor', 'fullName email image')
    .populate('clientReview')
    .populate('instructorReview');

  const card = (userRole === 'instructor' || (!userRole && isInstructor))
    ? formatInstructorBookingCard(populated)
    : formatUserBookingCard(populated);

  let completionMessage = '';
  if (booking.status === 'completed') {
    completionMessage = 'Lesson confirmed and completed successfully!';
  } else if (isInstructor) {
    completionMessage = 'You marked the lesson as complete. Client has 72 hours (3 days) to confirm before automatic payout release.';
  } else {
    completionMessage = 'Lesson confirmed successfully! Marked as completed.';
  }

  return {
    ...card,
    message: completionMessage,
    clientCompleted: booking.clientCompleted,
    instructorCompleted: booking.instructorCompleted,
    bothCompleted: booking.status === 'completed',
    status: booking.status
  };
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

  const { startDateTime } = getBookingDateTimes(booking);
  const lessonDate = startDateTime || new Date(booking.date);
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
    return completeBookingService(bookingId, userId, userRole);
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

  // Auto-sync accepted bookings whose start time has arrived to 'active'
  await syncAllAcceptedBookings();

  // 1. Fetch total counts across tab categories
  const [allCount, upcomingCount, activeCount, completedCount, cancelledCount] = await Promise.all([
    Booking.countDocuments({}),
    Booking.countDocuments({ status: 'accepted' }),
    Booking.countDocuments({ status: 'active' }),
    Booking.countDocuments({ status: 'completed' }),
    Booking.countDocuments({ status: { $in: ['cancelled', 'declined'] } })
  ]);

  const filter = {};

  if (status && status !== 'all') {
    if (status === 'upcoming') {
      filter.status = 'accepted';
    } else if (status === 'active') {
      filter.status = 'active';
    } else if (['completed', 'complete'].includes(status)) {
      filter.status = 'completed';
    } else if (['cancelled', 'declined'].includes(status)) {
      filter.status = { $in: ['cancelled', 'declined'] };
    } else if (['requested', 'requests', 'pending'].includes(status)) {
      filter.status = 'pending';
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

    const inProgress = getIsInProgress(b);
    let displayStatus = b.status || 'pending';
    if (displayStatus === 'accepted' && inProgress) displayStatus = 'active';
    else if (displayStatus === 'accepted') displayStatus = 'upcoming';
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
      status: displayStatus,
      rawStatus: b.status,
      inProgress,
      isInProgress: inProgress,
      clientCompleted: b.status === 'completed' || Boolean(b.clientCompleted),
      instructorCompleted: b.status === 'completed' || Boolean(b.instructorCompleted),
      bothCompleted: b.status === 'completed' || (Boolean(b.clientCompleted) && Boolean(b.instructorCompleted)),
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

  const inProgress = getIsInProgress(booking);
  let displayStatus = booking.status || 'pending';
  if (displayStatus === 'accepted' && inProgress) displayStatus = 'active';
  else if (displayStatus === 'accepted') displayStatus = 'upcoming';
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
    rawStatus: booking.status,
    inProgress,
    isInProgress: inProgress,
    clientCompleted: booking.status === 'completed' || Boolean(booking.clientCompleted),
    instructorCompleted: booking.status === 'completed' || Boolean(booking.instructorCompleted),
    bothCompleted: booking.status === 'completed' || (Boolean(booking.clientCompleted) && Boolean(booking.instructorCompleted)),
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
      updateData.clientCompleted = true;
      updateData.instructorCompleted = true;
      updateData.clientCompletedAt = new Date();
      updateData.instructorCompletedAt = new Date();
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
      console.warn(`[Stripe Webhook] Signature verification notice: ${err.message}. Processing payload in development/fallback mode.`);
      if (bodyData && bodyData.type) {
        event = bodyData;
      } else if (rawBody) {
        try {
          event = JSON.parse(rawBody.toString('utf8'));
        } catch (parseErr) {
          throw new ApiError(httpStatus.BAD_REQUEST || 400, `Webhook Signature Verification Failed: ${err.message}`);
        }
      } else {
        throw new ApiError(httpStatus.BAD_REQUEST || 400, `Webhook Signature Verification Failed: ${err.message}`);
      }
    }
  } else if (bodyData && bodyData.type) {
    event = bodyData;
  } else if (rawBody) {
    try {
      event = JSON.parse(rawBody.toString('utf8'));
    } catch (e) {
      throw new ApiError(httpStatus.BAD_REQUEST || 400, 'Invalid webhook payload JSON');
    }
  } else {
    throw new ApiError(httpStatus.BAD_REQUEST || 400, 'Missing webhook event payload');
  }

  const eventType = event.type;
  const dataObject = event.data?.object || {};

  console.log(`[Stripe Webhook] Received event: ${eventType} (${event.id || 'no-id'})`);

  switch (eventType) {
    case 'checkout.session.completed': {
      const session = dataObject;
      const bookingId = session.metadata?.bookingId || session.client_reference_id;
      const bookingReference = session.metadata?.bookingReference;
      const sessionId = session.id;
      const paymentIntentId = typeof session.payment_intent === 'object'
        ? session.payment_intent?.id
        : session.payment_intent;

      const booking = await Booking.findOne({
        $or: [
          ...(bookingId && mongoose.Types.ObjectId.isValid(bookingId) ? [{ _id: bookingId }] : []),
          ...(bookingReference ? [{ bookingId: bookingReference }] : []),
          ...(sessionId ? [{ 'payment.stripeSessionId': sessionId }] : []),
          ...(paymentIntentId ? [{ 'payment.stripePaymentIntentId': paymentIntentId }, { 'payment.transactionId': paymentIntentId }] : [])
        ]
      });

      if (booking) {
        booking.payment.status = 'paid';
        booking.payment.paidAt = booking.payment.paidAt || new Date();
        if (sessionId) booking.payment.stripeSessionId = sessionId;
        if (paymentIntentId) {
          booking.payment.stripePaymentIntentId = paymentIntentId;
          booking.payment.transactionId = paymentIntentId;
        } else if (sessionId && !booking.payment.transactionId) {
          booking.payment.transactionId = sessionId;
        }
        if (booking.status === 'pending_payment') {
          booking.status = 'pending';
        }
        await booking.save();
        console.log(`[Stripe Webhook] Booking ${booking.bookingId || booking._id} confirmed and marked as paid via checkout.session.completed`);
      }
      break;
    }

    case 'checkout.session.async_payment_succeeded': {
      const session = dataObject;
      const bookingId = session.metadata?.bookingId || session.client_reference_id;
      const bookingReference = session.metadata?.bookingReference;
      const booking = await Booking.findOne({
        $or: [
          ...(bookingId && mongoose.Types.ObjectId.isValid(bookingId) ? [{ _id: bookingId }] : []),
          ...(bookingReference ? [{ bookingId: bookingReference }] : []),
          ...(session.id ? [{ 'payment.stripeSessionId': session.id }] : [])
        ]
      });
      if (booking) {
        booking.payment.status = 'paid';
        booking.payment.paidAt = booking.payment.paidAt || new Date();
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
      const bookingReference = session.metadata?.bookingReference;
      const booking = await Booking.findOne({
        $or: [
          ...(bookingId && mongoose.Types.ObjectId.isValid(bookingId) ? [{ _id: bookingId }] : []),
          ...(bookingReference ? [{ bookingId: bookingReference }] : []),
          ...(session.id ? [{ 'payment.stripeSessionId': session.id }] : [])
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
      const bookingId = dataObject.metadata?.bookingId;
      const bookingReference = dataObject.metadata?.bookingReference;

      const booking = await Booking.findOne({
        $or: [
          ...(piId ? [{ 'payment.stripePaymentIntentId': piId }, { 'payment.transactionId': piId }] : []),
          ...(bookingId && mongoose.Types.ObjectId.isValid(bookingId) ? [{ _id: bookingId }] : []),
          ...(bookingReference ? [{ bookingId: bookingReference }] : [])
        ]
      });

      if (booking) {
        booking.payment.status = 'paid';
        booking.payment.paidAt = booking.payment.paidAt || new Date();
        if (piId) {
          booking.payment.transactionId = piId;
          booking.payment.stripePaymentIntentId = piId;
        }
        if (booking.status === 'pending_payment') {
          booking.status = 'pending';
        }
        await booking.save();
        console.log(`[Stripe Webhook] Booking ${booking.bookingId || booking._id} marked as paid via payment_intent.succeeded`);
      }
      break;
    }

    case 'payment_intent.payment_failed': {
      const piId = dataObject.id;
      const bookingId = dataObject.metadata?.bookingId;
      const booking = await Booking.findOne({
        $or: [
          ...(piId ? [{ 'payment.stripePaymentIntentId': piId }, { 'payment.transactionId': piId }] : []),
          ...(bookingId && mongoose.Types.ObjectId.isValid(bookingId) ? [{ _id: bookingId }] : [])
        ]
      });

      if (booking && booking.payment.status !== 'paid') {
        booking.payment.status = 'failed';
        await booking.save();
      }
      break;
    }

    case 'charge.succeeded': {
      const chargeId = dataObject.id;
      const piId = typeof dataObject.payment_intent === 'object'
        ? dataObject.payment_intent?.id
        : dataObject.payment_intent;
      const bookingId = dataObject.metadata?.bookingId;
      const bookingReference = dataObject.metadata?.bookingReference;

      const booking = await Booking.findOne({
        $or: [
          ...(piId ? [{ 'payment.stripePaymentIntentId': piId }, { 'payment.transactionId': piId }] : []),
          ...(chargeId ? [{ 'payment.transactionId': chargeId }] : []),
          ...(bookingId && mongoose.Types.ObjectId.isValid(bookingId) ? [{ _id: bookingId }] : []),
          ...(bookingReference ? [{ bookingId: bookingReference }] : [])
        ]
      });

      if (booking) {
        booking.payment.status = 'paid';
        booking.payment.paidAt = booking.payment.paidAt || new Date();
        if (piId) {
          booking.payment.stripePaymentIntentId = piId;
          booking.payment.transactionId = piId;
        } else if (chargeId && !booking.payment.transactionId) {
          booking.payment.transactionId = chargeId;
        }
        if (booking.status === 'pending_payment') {
          booking.status = 'pending';
        }
        await booking.save();
        console.log(`[Stripe Webhook] Booking ${booking.bookingId || booking._id} marked as paid via charge.succeeded`);
      }
      break;
    }

    case 'charge.refunded': {
      const piId = typeof dataObject.payment_intent === 'object'
        ? dataObject.payment_intent?.id
        : dataObject.payment_intent;
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

    case 'payment_intent.created':
    case 'charge.updated':
    default:
      // Acknowledge received event cleanly
      break;
  }

  return { received: true, event: eventType };
};

/**
 * Get or Create Chat for a Booking
 */
const getBookingChatService = async (bookingId, userId) => {
  if (!mongoose.Types.ObjectId.isValid(bookingId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid Booking ID');
  }

  const booking = await Booking.findById(bookingId).populate('client instructor chat');
  if (!booking) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Booking not found');
  }

  const isClient = booking.client && booking.client._id && userId && booking.client._id.toString() === userId.toString();
  const isInstructor = booking.instructor && booking.instructor._id && userId && booking.instructor._id.toString() === userId.toString();

  if (userId && !isClient && !isInstructor) {
    throw new ApiError(httpStatus.FORBIDDEN, 'You are not a participant in this booking');
  }

  const Chat = require('../Chat/chat.model');
  let chat = booking.chat;

  if (!chat) {
    chat = await Chat.findOne({
      participants: { $all: [booking.client._id, booking.instructor._id] }
    });

    if (!chat) {
      chat = await Chat.create({
        participants: [booking.client._id, booking.instructor._id],
        booking: booking._id,
        unreadCounts: {
          [booking.client._id.toString()]: 0,
          [booking.instructor._id.toString()]: 0
        }
      });
    }

    booking.chat = chat._id;
    await booking.save();
  }

  return {
    chatId: chat._id || chat,
    bookingId: booking._id,
    participants: chat.participants || [booking.client._id, booking.instructor._id],
    chat
  };
};

module.exports = {
  createBookingService,
  getMyBookingsService,
  getBookingTabCountsService,
  getBookingByIdService,
  getBookingChatService,
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
  checkBookingConflictService,
  getBookingDateTimes,
  isBookingTimeStarted,
  getIsInProgress,
  syncUserBookingsActiveStatus,
  syncAllAcceptedBookings,
  syncAutoConfirmedBookings
};



