const mongoose = require('mongoose');
const { status: httpStatus } = require('http-status');
const ApiError = require('../../helpers/ApiError');
const Report = require('./report.model');
const Booking = require('../Booking/booking.model');
const User = require('../User/user.model');

// Helper to format date like "Aug 5, 2026"
const formatDisplayDate = (dateObj) => {
  if (!dateObj) return 'N/A';
  const d = new Date(dateObj);
  if (isNaN(d.getTime())) return 'N/A';
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
};

// Helper to get initials from fullName
const getInitials = (name) => {
  if (!name || typeof name !== 'string') return '??';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

// Avatar color palette matching Figma
const AVATAR_PALETTE = ['#64748B', '#0EA5E9', '#EF4444', '#10B981', '#8B5CF6', '#F59E0B', '#EC4899', '#14B8A6'];

const getAvatarColor = (identifier, fallbackIndex = 0) => {
  if (identifier) {
    let hash = 0;
    const str = String(identifier);
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const idx = Math.abs(hash) % AVATAR_PALETTE.length;
    return AVATAR_PALETTE[idx];
  }
  return AVATAR_PALETTE[fallbackIndex % AVATAR_PALETTE.length];
};

const createReportService = async (userId, userRole, data = {}, files = []) => {
  let payload = data || {};
  if (payload && payload.data) {
    if (typeof payload.data === 'string') {
      try {
        payload = JSON.parse(payload.data);
      } catch (e) {
        // keep payload
      }
    } else if (typeof payload.data === 'object' && payload.data !== null) {
      payload = payload.data;
    }
  }

  const { bookingId, reason, details } = payload;

  if (!reason || !reason.trim()) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Dispute reason is required');
  }

  // Look up booking by Mongo _id or custom bookingId
  let bookingFilter = {};
  if (bookingId && mongoose.Types.ObjectId.isValid(bookingId)) {
    bookingFilter = { $or: [{ _id: bookingId }, { bookingId: bookingId }] };
  } else if (bookingId) {
    bookingFilter = { bookingId: bookingId };
  } else {
    // If no bookingId provided, fallback to finding active/recent booking for this user
    const recentBooking = await Booking.findOne({
      $or: [{ client: userId }, { instructor: userId }]
    }).sort({ createdAt: -1 });

    if (!recentBooking) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Booking ID is required to file a report');
    }
    bookingFilter = { _id: recentBooking._id };
  }

  const booking = await Booking.findOne(bookingFilter)
    .populate('client', 'fullName email')
    .populate('instructor', 'fullName email');

  if (!booking) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Booking not found');
  }

  // Determine reporter ID safely (handles optional auth or demo payload)
  let effectiveUserId = userId;
  if (!effectiveUserId) {
    effectiveUserId = userRole === 'instructor' ? booking.instructor?._id : booking.client?._id;
  }

  // Verify authorization (Must be client, instructor, or admin)
  const isClient = booking.client?._id?.toString() === effectiveUserId?.toString();
  const isInstructor = booking.instructor?._id?.toString() === effectiveUserId?.toString();
  const isAdmin = userRole === 'admin';

  if (!isClient && !isInstructor && !isAdmin) {
    throw new ApiError(httpStatus.FORBIDDEN, 'You are not authorized to report this booking');
  }

  // Process photos
  const photoPaths = [];
  if (files && Array.isArray(files)) {
    files.forEach((file) => {
      photoPaths.push(`/uploads/reports/${file.filename}`);
    });
  } else if (files && files.filename) {
    photoPaths.push(`/uploads/reports/${files.filename}`);
  }

  // Also support photo / image url passed in body
  const photoUrl = payload.photo || payload.image || data.photo || data.image;
  if (photoUrl && typeof photoUrl === 'string' && photoUrl.trim()) {
    photoPaths.push(photoUrl.trim());
  }

  const generatedBookingId =
    booking.bookingId || `BK-${booking._id.toString().slice(-5).toUpperCase()}`;

  const amount =
    booking.pricing?.totalAmount ||
    booking.pricing?.lessonPrice ||
    0;

  // Create dispute record
  const report = await Report.create({
    booking: booking._id,
    bookingId: generatedBookingId,
    reporter: effectiveUserId,
    reporterRole: userRole || (isInstructor ? 'instructor' : 'user'),
    client: booking.client._id,
    instructor: booking.instructor._id,
    reason: reason.trim(),
    details: (details || '').trim(),
    photos: photoPaths,
    amount,
    lessonDate: booking.date || new Date(),
    status: 'open'
  });

  // Flag booking status as disputed
  await Booking.findByIdAndUpdate(booking._id, {
    status: 'disputed'
  });

  return {
    reportId: report._id,
    bookingId: report.bookingId,
    reason: report.reason,
    details: report.details,
    photos: report.photos,
    status: report.status,
    createdAt: report.createdAt
  };
};

/**
 * Admin Disputes List (Figma 40012554:20231)
 * Columns: Booking ID, Client, Instructor, Date, Status, Reason, Actions
 * Tabs: Open (count), Resolved (count), All (count)
 */
const getAdminDisputesListService = async (queryParams = {}) => {
  const {
    status = 'all',
    search,
    sortBy = 'createdAt',
    sortOrder = 'desc',
    page = 1,
    limit = 20
  } = queryParams;

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.max(1, Number(limit) || 20);
  const skip = (pageNum - 1) * limitNum;

  // 1. Fetch total counts across tab categories
  const [allCount, openCount, resolvedCount] = await Promise.all([
    Report.countDocuments({}),
    Report.countDocuments({ status: 'open' }),
    Report.countDocuments({ status: { $in: ['resolved', 'dismissed'] } })
  ]);

  // 2. Build filter
  const filter = {};
  if (status && status !== 'all') {
    if (status === 'open') {
      filter.status = 'open';
    } else if (status === 'resolved') {
      filter.status = { $in: ['resolved', 'dismissed'] };
    } else {
      filter.status = status;
    }
  }

  // 3. Search query
  if (search && search.trim()) {
    const searchRegex = new RegExp(search.trim(), 'i');

    const matchingUsers = await User.find({
      fullName: searchRegex
    }).select('_id').lean();

    const matchingUserIds = matchingUsers.map((u) => u._id);

    filter.$or = [
      { bookingId: searchRegex },
      { reason: searchRegex },
      { details: searchRegex },
      { client: { $in: matchingUserIds } },
      { instructor: { $in: matchingUserIds } }
    ];
  }

  const sortDirection = sortOrder === 'asc' ? 1 : -1;
  const sortCriteria = { [sortBy]: sortDirection };

  const totalFiltered = await Report.countDocuments(filter);
  const reports = await Report.find(filter)
    .sort(sortCriteria)
    .skip(skip)
    .limit(limitNum)
    .populate('client', 'fullName image')
    .populate('instructor', 'fullName image')
    .lean();

  const formattedDisputes = reports.map((rep, idx) => {
    const clientName = rep.client?.fullName || 'Client';
    const instructorName = rep.instructor?.fullName || 'Instructor';
    const clientLetter = getInitials(clientName);
    const instructorLetter = getInitials(instructorName);
    const clientColor = getAvatarColor(rep.client?._id || clientName, idx * 2);
    const instructorColor = getAvatarColor(rep.instructor?._id || instructorName, idx * 2 + 1);

    return {
      _id: rep._id,
      bookingId: rep.bookingId,
      client: {
        _id: rep.client?._id || null,
        fullName: clientName,
        image: rep.client?.image || null,
        letter: clientLetter,
        color: clientColor,
        initials: clientLetter,
        avatarColor: clientColor
      },
      instructor: {
        _id: rep.instructor?._id || null,
        fullName: instructorName,
        image: rep.instructor?.image || null,
        letter: instructorLetter,
        color: instructorColor,
        initials: instructorLetter,
        avatarColor: instructorColor
      },
      date: formatDisplayDate(rep.lessonDate || rep.createdAt),
      status: rep.status,
      reason: rep.reason
    };
  });

  return {
    counts: {
      open: openCount,
      resolved: resolvedCount,
      all: allCount
    },
    disputes: formattedDisputes,
    pagination: {
      totalResults: totalFiltered,
      totalPages: Math.ceil(totalFiltered / limitNum),
      currentPage: pageNum,
      limit: limitNum
    }
  };
};

/**
 * Admin Dispute Details Drawer (Figma 40012554:20832)
 * Slide-out drawer with Dispute: BK-XXXX, Badge, Client, Instructor,
 * Booking ID, Date, Amount, Flagged Reason, Details, Photo, Dismiss & Resolve actions.
 */
const getAdminDisputeDetailsService = async (disputeId) => {
  let filter = {};
  if (mongoose.Types.ObjectId.isValid(disputeId)) {
    filter = { _id: disputeId };
  } else {
    filter = { bookingId: disputeId };
  }

  const dispute = await Report.findOne(filter)
    .populate('client', 'fullName email image number')
    .populate('instructor', 'fullName email image number')
    .populate('reporter', 'fullName email role')
    .populate('resolution.resolvedBy', 'fullName email')
    .populate('booking')
    .lean();

  if (!dispute) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Dispute record not found');
  }

  const clientName = dispute.client?.fullName || 'Client';
  const instructorName = dispute.instructor?.fullName || 'Instructor';
  const clientLetter = getInitials(clientName);
  const instructorLetter = getInitials(instructorName);
  const clientColor = getAvatarColor(dispute.client?._id || clientName, 2);
  const instructorColor = getAvatarColor(dispute.instructor?._id || instructorName, 0);
  const displayDate = formatDisplayDate(dispute.lessonDate || dispute.booking?.date || dispute.createdAt);

  const displayStatus =
    dispute.status === 'open' ? 'Open' : (dispute.status === 'dismissed' ? 'Dismissed' : 'Resolved');

  return {
    _id: dispute._id,
    bookingId: dispute.bookingId,
    status: dispute.status,
    statusBadge: displayStatus,
    client: {
      _id: dispute.client?._id,
      fullName: clientName,
      letter: clientLetter,
      color: clientColor,
      initials: clientLetter,
      avatarColor: clientColor,
      image: dispute.client?.image || null,
      email: dispute.client?.email,
      phone: dispute.client?.number
    },
    instructor: {
      _id: dispute.instructor?._id,
      fullName: instructorName,
      letter: instructorLetter,
      color: instructorColor,
      initials: instructorLetter,
      avatarColor: instructorColor,
      image: dispute.instructor?.image || null,
      email: dispute.instructor?.email,
      phone: dispute.instructor?.number
    },
    reporter: {
      _id: dispute.reporter?._id,
      fullName: dispute.reporter?.fullName,
      role: dispute.reporterRole
    },
    date: displayDate,
    amount: `$${dispute.amount || 0}`,
    numericAmount: dispute.amount || 0,
    flaggedReason: dispute.reason,
    details: dispute.details || 'No additional details provided.',
    photo: dispute.photos && dispute.photos.length > 0 ? dispute.photos[0] : null,
    photos: dispute.photos || [],
    hasPhoto: dispute.photos && dispute.photos.length > 0,
    resolution: dispute.resolution || null,
    createdAt: dispute.createdAt
  };
};

/**
 * Admin Dispute Resolution Actions (Dismiss / Resolve – No Action / Custom)
 */
const adminResolveDisputeService = async (disputeId, adminId, body = {}) => {
  const { action = 'resolved_no_action', notes = '' } = body;

  let filter = {};
  if (mongoose.Types.ObjectId.isValid(disputeId)) {
    filter = { _id: disputeId };
  } else {
    filter = { bookingId: disputeId };
  }

  const dispute = await Report.findOne(filter);
  if (!dispute) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Dispute not found');
  }

  let newStatus = 'resolved';
  let resolvedAction = action;

  if (action === 'dismiss' || action === 'dismissed') {
    newStatus = 'dismissed';
    resolvedAction = 'dismissed';
  } else if (action === 'resolve_no_action' || action === 'resolved_no_action') {
    newStatus = 'resolved';
    resolvedAction = 'resolved_no_action';
  } else {
    newStatus = 'resolved';
    resolvedAction = action;
  }

  dispute.status = newStatus;
  dispute.resolution = {
    action: resolvedAction,
    notes: notes || (resolvedAction === 'dismissed' ? 'Dismissed by admin' : 'Resolved with no further action taken'),
    resolvedBy: adminId,
    resolvedAt: new Date()
  };

  await dispute.save();

  // If dispute is dismissed or resolved, restore the booking status back from 'disputed' to 'completed' or original status
  if (dispute.booking) {
    await Booking.findByIdAndUpdate(dispute.booking, {
      status: resolvedAction === 'refunded' ? 'cancelled' : 'completed'
    });
  }

  return getAdminDisputeDetailsService(dispute._id);
};

/**
 * Get Reports for current logged in user (Client or Instructor)
 */
const getMyReportsService = async (userId, queryParams = {}) => {
  const { status: filterStatus } = queryParams;

  const filter = {
    $or: [{ client: userId }, { instructor: userId }, { reporter: userId }]
  };

  if (filterStatus && filterStatus !== 'all') {
    filter.status = filterStatus;
  }

  const reports = await Report.find(filter)
    .sort({ createdAt: -1 })
    .populate('client', 'fullName email image')
    .populate('instructor', 'fullName email image')
    .populate('booking', 'date startTime endTime')
    .lean();

  return reports.map((rep) => ({
    _id: rep._id,
    bookingId: rep.bookingId,
    reason: rep.reason,
    details: rep.details,
    photos: rep.photos,
    status: rep.status,
    amount: rep.amount,
    date: formatDisplayDate(rep.lessonDate || rep.createdAt),
    clientName: rep.client?.fullName,
    instructorName: rep.instructor?.fullName,
    createdAt: rep.createdAt
  }));
};

module.exports = {
  createReportService,
  getAdminDisputesListService,
  getAdminDisputeDetailsService,
  adminResolveDisputeService,
  getMyReportsService
};
