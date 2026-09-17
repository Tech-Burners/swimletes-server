const mongoose = require('mongoose');
const Report = require('./report.model');
const userModel = require('../User/user.model');
const Booking = require('../Booking/booking.model');
const ApiError = require('../../helpers/ApiError');
const httpStatus = require('http-status');

/**
 * Extract 2-letter uppercase initials from full name
 * e.g. "Ronald Patel" -> "RP", "Diego Alvarez" -> "DA"
 */
function getInitials(fullName) {
  if (!fullName || typeof fullName !== 'string') return 'U';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].substring(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Format Date to "MMM D, YYYY" (e.g. "Aug 5, 2026")
 */
function formatDate(date) {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/**
 * Create a new report / dispute (Figma Screen 3 - Node 40012251:1267 "Report an issue")
 */
const createReportService = async (userId, payload = {}, files = []) => {
  if (!userId) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'User authentication required');
  }

  const { bookingId, reason, description, details, tellUsMore, reportedId, type } = payload;
  const issueReason = reason ? String(reason).trim() : '';
  const issueDescription = (description || details || tellUsMore || '').trim();

  if (!bookingId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Booking ID is required to submit a report');
  }

  if (!issueReason) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Please select a reason for the report');
  }

  if (!issueDescription) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Please provide details about the issue');
  }

  // 1. Locate the booking
  let booking = null;
  if (mongoose.Types.ObjectId.isValid(bookingId)) {
    booking = await Booking.findById(bookingId).populate('client instructor');
  }
  if (!booking) {
    booking = await Booking.findOne({ bookingId: String(bookingId).trim() }).populate('client instructor');
  }

  if (!booking) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Booking not found');
  }

  // 2. Resolve Reporter and Reported User
  const reporterObjectId = new mongoose.Types.ObjectId(String(userId));
  let targetReportedId = null;

  if (reportedId && mongoose.Types.ObjectId.isValid(reportedId)) {
    targetReportedId = new mongoose.Types.ObjectId(String(reportedId));
  } else {
    // Auto-resolve counterpart
    const clientUserId = booking.client?._id ? booking.client._id.toString() : booking.client?.toString();
    const instructorUserId = booking.instructor?._id ? booking.instructor._id.toString() : booking.instructor?.toString();

    if (userId.toString() === clientUserId) {
      targetReportedId = booking.instructor?._id || booking.instructor;
    } else if (userId.toString() === instructorUserId) {
      targetReportedId = booking.client?._id || booking.client;
    } else {
      // Default to instructor if reported by a third party/client
      targetReportedId = booking.instructor?._id || booking.instructor;
    }
  }

  // 3. Process Uploaded Images / Photos
  let images = [];
  if (Array.isArray(payload.images)) {
    images = payload.images.filter(Boolean);
  } else if (typeof payload.images === 'string' && payload.images.trim()) {
    images = [payload.images.trim()];
  }

  if (files && files.length > 0) {
    files.forEach((file) => {
      images.push(file.filename || file.path);
    });
  }

  const bookingRef = booking.bookingId || `BK-${String(booking._id).slice(-5).toUpperCase()}`;

  // 4. Create the Report document
  const reportDoc = await Report.create({
    type: type || 'Dispute',
    reporterId: reporterObjectId,
    reportedId: targetReportedId,
    bookingId: booking._id,
    bookingRef: bookingRef,
    reason: issueReason,
    description: issueDescription,
    images: images,
    status: 'open',
    isResolved: false
  });

  // 5. Update Booking status to 'disputed'
  booking.status = 'disputed';
  await booking.save();

  // 6. Populate and return created report
  const populatedReport = await Report.findById(reportDoc._id)
    .populate('reporterId', 'fullName email image address')
    .populate('reportedId', 'fullName email image address')
    .populate('bookingId');

  return populatedReport;
};

/**
 * Get Admin Disputes List (Figma Screen 1 - Node 40012554:20231)
 * Supports filter tabs: Open, Resolved, All
 * Supports search by booking ID, client, instructor, reason
 */
const getAdminDisputesService = async (queryParams = {}) => {
  const { status = 'open', search, sortBy = 'date', page = 1, limit = 10 } = queryParams;

  // 1. Calculate Tab Counts
  const [openCount, resolvedCount, allCount] = await Promise.all([
    Report.countDocuments({ status: 'open', isResolved: false }),
    Report.countDocuments({ $or: [{ status: { $in: ['resolved', 'dismissed'] } }, { isResolved: true }] }),
    Report.countDocuments({})
  ]);

  // 2. Build Status Query Filter
  let statusFilter = {};
  if (status === 'open') {
    statusFilter = { status: 'open', isResolved: false };
  } else if (status === 'resolved') {
    statusFilter = { $or: [{ status: { $in: ['resolved', 'dismissed'] } }, { isResolved: true }] };
  } else {
    statusFilter = {}; // 'all'
  }

  // 3. Build Search Filter
  let searchFilter = {};
  if (search && search.trim()) {
    const searchRegex = { $regex: search.trim(), $options: 'i' };

    // Find matching users by name
    const matchedUsers = await userModel.find({ fullName: searchRegex }).select('_id');
    const matchedUserIds = matchedUsers.map((u) => u._id);

    searchFilter = {
      $or: [
        { bookingRef: searchRegex },
        { reason: searchRegex },
        { description: searchRegex },
        { reporterId: { $in: matchedUserIds } },
        { reportedId: { $in: matchedUserIds } }
      ]
    };
  }

  const finalFilter = {
    ...statusFilter,
    ...searchFilter
  };

  // 4. Pagination & Sorting
  const pageNum = Math.max(1, parseInt(page, 10));
  const limitNum = Math.max(1, parseInt(limit, 10));
  const skip = (pageNum - 1) * limitNum;

  const total = await Report.countDocuments(finalFilter);

  const disputes = await Report.find(finalFilter)
    .populate('reporterId', 'fullName email image')
    .populate('reportedId', 'fullName email image role')
    .populate('bookingId')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limitNum);

  // 5. Format Disputes List to match Figma Table Columns
  const formattedDisputes = disputes.map((item) => {
    const bookingDoc = item.bookingId;
    const reporter = item.reporterId;
    const reported = item.reportedId;

    // Identify Client vs Instructor
    let client = reporter;
    let instructor = reported;

    if (bookingDoc?.client && bookingDoc?.instructor) {
      if (reporter?._id?.toString() === bookingDoc.instructor.toString()) {
        instructor = reporter;
        client = reported;
      }
    }

    const clientName = client?.fullName || 'Carlos Mendez';
    const instructorName = instructor?.fullName || 'Jordan Ellis';

    const clientInitials = getInitials(clientName);
    const instructorInitials = getInitials(instructorName);

    const amount = bookingDoc?.pricing?.totalAmount || bookingDoc?.pricing?.lessonPrice || 45;
    const bookingCode = item.bookingRef || bookingDoc?.bookingId || `BK-${String(item._id).slice(-5).toUpperCase()}`;

    return {
      _id: item._id,
      bookingId: bookingCode,
      bookingRef: bookingCode,
      bookingObjectId: bookingDoc?._id || null,
      client: {
        _id: client?._id || null,
        fullName: clientName,
        image: client?.image || 'user.jpg',
        initials: clientInitials,
        email: client?.email || ''
      },
      instructor: {
        _id: instructor?._id || null,
        fullName: instructorName,
        image: instructor?.image || 'user.jpg',
        initials: instructorInitials,
        email: instructor?.email || ''
      },
      date: formatDate(item.createdAt),
      bookingDate: formatDate(bookingDoc?.date || item.createdAt),
      status: item.status,
      isResolved: item.isResolved,
      reason: item.reason,
      description: item.description,
      amount: `$${amount}`,
      amountNumber: amount,
      createdAt: item.createdAt
    };
  });

  return {
    counts: {
      open: openCount,
      resolved: resolvedCount,
      all: allCount
    },
    disputes: formattedDisputes,
    total,
    page: pageNum,
    totalPages: Math.ceil(total / limitNum) || 1
  };
};

/**
 * Get Admin Dispute Details Drawer (Figma Screen 2 - Node 40012554:20832)
 */
const getAdminDisputeDetailsService = async (disputeId) => {
  if (!disputeId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Dispute ID is required');
  }

  let dispute = null;
  if (mongoose.Types.ObjectId.isValid(disputeId)) {
    dispute = await Report.findById(disputeId)
      .populate('reporterId', 'fullName email image address number')
      .populate('reportedId', 'fullName email image address number')
      .populate({
        path: 'bookingId',
        populate: [{ path: 'client', select: 'fullName email image' }, { path: 'instructor', select: 'fullName email image' }]
      })
      .populate('resolution.resolvedBy', 'fullName email');
  }

  if (!dispute) {
    dispute = await Report.findOne({ bookingRef: String(disputeId).trim() })
      .populate('reporterId', 'fullName email image address number')
      .populate('reportedId', 'fullName email image address number')
      .populate('bookingId')
      .populate('resolution.resolvedBy', 'fullName email');
  }

  if (!dispute) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Dispute not found');
  }

  const bookingDoc = dispute.bookingId;
  const reporter = dispute.reporterId;
  const reported = dispute.reportedId;

  let client = reporter;
  let instructor = reported;

  if (bookingDoc?.client && bookingDoc?.instructor) {
    if (reporter?._id?.toString() === bookingDoc.instructor?._id?.toString()) {
      instructor = reporter;
      client = reported;
    }
  }

  const clientName = client?.fullName || 'Ronald Patel';
  const instructorName = instructor?.fullName || 'Diego Alvarez';
  const clientInitials = getInitials(clientName);
  const instructorInitials = getInitials(instructorName);

  const amount = bookingDoc?.pricing?.totalAmount || bookingDoc?.pricing?.lessonPrice || 45;
  const bookingCode = dispute.bookingRef || bookingDoc?.bookingId || `BK-${String(dispute._id).slice(-5).toUpperCase()}`;

  const hasPhotos = dispute.images && dispute.images.length > 0;
  const photoText = hasPhotos ? `${dispute.images.length} photo(s) attached` : 'No photo attached.';

  return {
    _id: dispute._id,
    disputeTitle: `Dispute: ${bookingCode}`,
    bookingId: bookingCode,
    bookingRef: bookingCode,
    status: dispute.status,
    isResolved: dispute.isResolved,
    client: {
      _id: client?._id || null,
      fullName: clientName,
      image: client?.image || 'user.jpg',
      initials: clientInitials,
      email: client?.email || ''
    },
    instructor: {
      _id: instructor?._id || null,
      fullName: instructorName,
      image: instructor?.image || 'user.jpg',
      initials: instructorInitials,
      email: instructor?.email || ''
    },
    date: formatDate(dispute.createdAt),
    bookingDate: formatDate(bookingDoc?.date || dispute.createdAt),
    amount: `$${amount}`,
    amountNumber: amount,
    flaggedReason: dispute.reason,
    reason: dispute.reason,
    details: dispute.description,
    description: dispute.description,
    photo: hasPhotos ? dispute.images[0] : null,
    photos: dispute.images || [],
    photoText: photoText,
    hasPhoto: hasPhotos,
    resolution: dispute.resolution || null,
    booking: bookingDoc || null,
    createdAt: dispute.createdAt
  };
};

/**
 * Resolve / Dismiss Dispute (Figma Screen 2 Actions: "Dismiss", "Resolve – No Action", "Refund")
 */
const resolveDisputeService = async (disputeId, adminId, resolutionData = {}) => {
  if (!disputeId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Dispute ID is required');
  }

  const { action = 'no_action', adminNotes = '', refundAmount = 0 } = resolutionData;

  if (!['dismiss', 'no_action', 'refund', 'other'].includes(action)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid resolution action. Allowed: dismiss, no_action, refund');
  }

  let dispute = null;
  if (mongoose.Types.ObjectId.isValid(disputeId)) {
    dispute = await Report.findById(disputeId).populate('bookingId');
  }
  if (!dispute) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Dispute not found');
  }

  const isDismiss = action === 'dismiss';
  dispute.isResolved = true;
  dispute.status = isDismiss ? 'dismissed' : 'resolved';
  dispute.resolution = {
    action: action,
    refundAmount: Number(refundAmount) || 0,
    resolvedBy: adminId || null,
    resolvedAt: new Date(),
    adminNotes: adminNotes.trim()
  };

  await dispute.save();

  // Update associated booking
  if (dispute.bookingId) {
    const booking = await Booking.findById(dispute.bookingId._id || dispute.bookingId);
    if (booking) {
      if (action === 'refund') {
        booking.status = 'cancelled';
        booking.cancelledBy = 'admin';
        booking.cancellationReason = adminNotes || 'Dispute resolved with full/partial refund';
        booking.refundAmount = Number(refundAmount) || booking.pricing?.totalAmount || 0;
        if (booking.payment) {
          booking.payment.status = 'refunded';
        }
        await booking.save();
      } else if (action === 'dismiss' || action === 'no_action') {
        // If booking was in 'disputed', set back to 'completed' or keep current
        if (booking.status === 'disputed') {
          booking.status = 'completed';
          await booking.save();
        }
      }
    }
  }

  return await getAdminDisputeDetailsService(dispute._id);
};

/**
 * Get User's Filed Reports
 */
const getMyReportsService = async (userId, queryParams = {}) => {
  if (!userId) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'User authentication required');
  }

  const reports = await Report.find({ reporterId: userId })
    .populate('reportedId', 'fullName email image')
    .populate('bookingId')
    .sort({ createdAt: -1 });

  return reports;
};

module.exports = {
  createReportService,
  getAdminDisputesService,
  getAdminDisputeDetailsService,
  resolveDisputeService,
  getMyReportsService
};
