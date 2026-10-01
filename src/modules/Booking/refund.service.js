const mongoose = require('mongoose');
const Refund = require('./refund.model');
const Booking = require('./booking.model');
const stripeHelper = require('../../helpers/stripe');
const ApiError = require('../../helpers/ApiError');
const { status: httpStatus } = require('http-status');

const monthsShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const formatDateShort = (date) => {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  return `${monthsShort[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
};

const getInitials = (name) => {
  if (!name) return 'U';
  return name.split(' ').map((n) => n[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
};

/**
 * 1. Admin - Get Refunds Ledger (Figma Node 40012554:21158)
 */
const getAdminRefundsLedgerService = async (queryParams = {}) => {
  const { source, search, sortBy = 'date', sortOrder = 'desc', page = 1, limit = 10 } = queryParams;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, parseInt(limit, 10) || 10);
  const skip = (pageNum - 1) * limitNum;

  // Sync historical refunded bookings if Refund collection is completely empty
  const refundCount = await Refund.countDocuments();
  if (refundCount === 0) {
    const historicalRefundedBookings = await Booking.find({
      $or: [
        { 'payment.status': { $in: ['refunded', 'partially_refunded'] } },
        { refundAmount: { $gt: 0 } }
      ]
    }).populate('client instructor');

    for (const b of historicalRefundedBookings) {
      const src = b.cancellationReason ? 'Cancellation' : (b.disputeStatus ? 'Dispute' : 'Manual');
      await Refund.create({
        booking: b._id,
        bookingId: b.bookingId || '',
        client: b.client?._id || b.client,
        instructor: b.instructor?._id || b.instructor,
        amount: Number(b.refundAmount || b.pricing?.totalAmount || 0),
        source: src,
        status: 'Processed',
        date: b.updatedAt || b.date || new Date(),
        reason: b.cancellationReason || 'Booking refund',
        stripeRefundId: b.payment?.stripeRefundId || null
      });
    }
  }

  // Calculate Tab Counts
  const allCount = await Refund.countDocuments();
  const disputeCount = await Refund.countDocuments({ source: 'Dispute' });
  const cancellationCount = await Refund.countDocuments({ source: 'Cancellation' });
  const manualCount = await Refund.countDocuments({ source: 'Manual' });

  const query = {};
  if (source && source.toLowerCase() !== 'all') {
    const capitalized = source.charAt(0).toUpperCase() + source.slice(1).toLowerCase();
    query.source = capitalized;
  }

  const sortCriteria = {};
  if (sortBy === 'amount') {
    sortCriteria.amount = sortOrder === 'asc' ? 1 : -1;
  } else {
    sortCriteria.date = sortOrder === 'asc' ? 1 : -1;
  }

  let list = await Refund.find(query)
    .populate('client', 'fullName email image')
    .populate('instructor', 'fullName email image')
    .sort(sortCriteria);

  if (search && search.trim()) {
    const s = search.trim().toLowerCase();
    list = list.filter(
      (r) =>
        r.bookingId?.toLowerCase().includes(s) ||
        r.refundId?.toLowerCase().includes(s) ||
        r.client?.fullName?.toLowerCase().includes(s) ||
        r.client?.email?.toLowerCase().includes(s) ||
        r.instructor?.fullName?.toLowerCase().includes(s) ||
        r.instructor?.email?.toLowerCase().includes(s)
    );
  }

  const total = list.length;
  const paginated = list.slice(skip, skip + limitNum);

  const refunds = paginated.map((r) => {
    const clientName = r.client?.fullName || 'Client';
    const instructorName = r.instructor?.fullName || 'Instructor';

    return {
      _id: r._id,
      refundId: r.refundId,
      bookingId: r.bookingId || '',
      client: {
        _id: r.client?._id,
        name: clientName,
        avatar: r.client?.image || null,
        initials: getInitials(clientName)
      },
      instructor: {
        _id: r.instructor?._id,
        name: instructorName,
        avatar: r.instructor?.image || null,
        initials: getInitials(instructorName)
      },
      amount: Number(r.amount || 0),
      amountFormatted: `$${Number(r.amount || 0).toFixed(0)}`,
      source: r.source,
      date: r.date,
      dateFormatted: formatDateShort(r.date),
      status: r.status,
      reason: r.reason || '—'
    };
  });

  return {
    tabCounts: {
      all: allCount,
      dispute: disputeCount,
      cancellation: cancellationCount,
      manual: manualCount
    },
    total,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.ceil(total / limitNum) || 1,
    refunds
  };
};

/**
 * 2. Admin - Get Refund Details by ID
 */
const getAdminRefundDetailsService = async (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid Refund ID');
  }

  const refund = await Refund.findById(id)
    .populate('client', 'fullName email image phone')
    .populate('instructor', 'fullName email image phone')
    .populate('booking');

  if (!refund) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Refund record not found');
  }

  return refund;
};

/**
 * 3. Admin - Issue Manual Refund (Figma Node 40012554:21158)
 */
const issueAdminManualRefundService = async (body = {}, adminId = null) => {
  const { bookingId, amount, reason } = body;

  if (!bookingId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Please provide bookingId or booking _id');
  }

  // Find booking by _id or custom bookingId
  let booking = null;
  if (mongoose.Types.ObjectId.isValid(bookingId)) {
    booking = await Booking.findById(bookingId).populate('client instructor');
  }
  if (!booking) {
    booking = await Booking.findOne({ bookingId }).populate('client instructor');
  }

  if (!booking) {
    throw new ApiError(httpStatus.NOT_FOUND, `Booking '${bookingId}' not found`);
  }

  const totalPaid = Number(booking.pricing?.totalAmount || 0);
  const alreadyRefunded = Number(booking.refundAmount || 0);
  const maxRefundable = Math.max(0, totalPaid - alreadyRefunded);

  const refundAmt = amount !== undefined && amount !== null ? Number(amount) : maxRefundable;

  if (isNaN(refundAmt) || refundAmt <= 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Please provide a valid refund amount greater than 0');
  }

  if (refundAmt > maxRefundable) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Requested refund ($${refundAmt.toFixed(2)}) exceeds remaining refundable balance ($${maxRefundable.toFixed(2)})`
    );
  }

  let stripeRefundId = null;
  let refundStatus = 'Processed';

  // Process Stripe refund if payment was captured
  if (booking.payment?.stripePaymentIntentId) {
    try {
      const refund = await stripeHelper.createRefund({
        paymentIntentId: booking.payment.stripePaymentIntentId,
        amount: refundAmt,
        reason: reason || 'requested_by_customer',
        metadata: {
          bookingId: booking.bookingId || String(booking._id),
          issuedBy: adminId ? String(adminId) : 'admin',
          source: 'manual_admin_refund'
        }
      });
      stripeRefundId = refund.id;
    } catch (err) {
      console.error('Error executing Stripe refund in issueAdminManualRefundService:', err.message);
      refundStatus = 'Failed';
      throw new ApiError(httpStatus.BAD_GATEWAY, `Stripe refund failed: ${err.message}`);
    }
  }

  // Record Refund in ledger
  const refundRecord = await Refund.create({
    booking: booking._id,
    bookingId: booking.bookingId || '',
    client: booking.client?._id || booking.client,
    instructor: booking.instructor?._id || booking.instructor,
    amount: refundAmt,
    source: 'Manual',
    status: refundStatus,
    date: new Date(),
    reason: reason ? String(reason).trim() : 'Manual refund issued by administrator',
    stripeRefundId,
    issuedBy: adminId
  });

  // Update booking
  booking.refundAmount = alreadyRefunded + refundAmt;
  if (!booking.payment) booking.payment = {};
  booking.payment.status = booking.refundAmount >= totalPaid ? 'refunded' : 'partially_refunded';
  if (stripeRefundId) booking.payment.stripeRefundId = stripeRefundId;
  await booking.save();

  return {
    _id: refundRecord._id,
    refundId: refundRecord.refundId,
    bookingId: booking.bookingId || String(booking._id),
    client: {
      _id: booking.client?._id,
      name: booking.client?.fullName || 'Client'
    },
    instructor: {
      _id: booking.instructor?._id,
      name: booking.instructor?.fullName || 'Instructor'
    },
    amount: refundAmt,
    source: 'Manual',
    status: refundStatus,
    date: refundRecord.date,
    reason: refundRecord.reason,
    stripeRefundId
  };
};

module.exports = {
  getAdminRefundsLedgerService,
  getAdminRefundDetailsService,
  issueAdminManualRefundService
};
