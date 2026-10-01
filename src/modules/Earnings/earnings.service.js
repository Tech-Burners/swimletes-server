const mongoose = require('mongoose');
const Booking = require('../Booking/booking.model');
const User = require('../User/user.model');
const Transaction = require('./transaction.model');
const ApiError = require('../../helpers/ApiError');
const { status: httpStatus } = require('http-status');

const monthsShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthsFull = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

/**
 * Safely parse date
 */
const parseDate = (dateInput) => {
  if (!dateInput) return null;
  const d = new Date(dateInput);
  return isNaN(d.getTime()) ? null : d;
};

/**
 * 1. Get Instructor Earnings Overview Data (Figma Node 40012419:6929)
 */
const getInstructorEarningsOverviewService = async (instructorId, queryMonth = null, queryYear = null) => {
  if (!mongoose.Types.ObjectId.isValid(instructorId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid Instructor ID');
  }

  const instructor = await User.findById(instructorId);
  if (!instructor) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Instructor not found');
  }

  const now = new Date();
  const targetYear = queryYear ? parseInt(queryYear, 10) : now.getFullYear();
  const targetMonthIndex = queryMonth !== null && queryMonth !== undefined
    ? (typeof queryMonth === 'string' && isNaN(parseInt(queryMonth, 10))
        ? monthsFull.findIndex((m) => m.toLowerCase() === queryMonth.toLowerCase())
        : parseInt(queryMonth, 10) - 1)
    : now.getMonth();

  const safeMonthIndex = targetMonthIndex >= 0 && targetMonthIndex <= 11 ? targetMonthIndex : now.getMonth();

  // 1. Fetch all bookings for this instructor
  const allBookings = await Booking.find({
    instructor: instructorId
  }).populate('client', 'fullName email image');

  // 2. Fetch explicit transaction records (e.g. withdrawals)
  const explicitTransactions = await Transaction.find({
    instructor: instructorId,
    status: { $ne: 'failed' }
  });

  let totalEarned = 0;
  let pendingAmount = 0;
  let completedLessonsCount = 0;

  // Track monthly earnings for chart (12 months of targetYear)
  const monthlyEarnings = Array(12).fill(0);

  // Month breakdown accumulators for targetMonth
  let monthLessonsCount = 0;
  let monthLessonsGross = 0;
  let monthLateCancellationFees = 0;
  let monthPlatformFee = 0;

  for (const b of allBookings) {
    const bDate = parseDate(b.date) || parseDate(b.createdAt) || now;
    const isTargetYear = bDate.getFullYear() === targetYear;
    const bMonth = bDate.getMonth();

    const parentPays = Number(b.pricing?.totalAmount || 0);
    const earnings = Number(b.pricing?.instructorEarnings || (parentPays * 0.85));
    const platformFee = Number(b.pricing?.platformCommission || (parentPays - earnings));

    // Completed bookings -> Available/Total earnings
    if (b.status === 'completed' || (b.clientCompleted && b.instructorCompleted)) {
      totalEarned += earnings;
      completedLessonsCount += 1;

      if (isTargetYear) {
        monthlyEarnings[bMonth] += earnings;
      }

      if (isTargetYear && bMonth === safeMonthIndex) {
        monthLessonsCount += 1;
        monthLessonsGross += parentPays;
        monthPlatformFee += platformFee;
      }
    }
    // Pending Approval bookings -> Sitting in 72h confirmation window
    else if (b.instructorCompleted && !b.clientCompleted && b.status !== 'cancelled') {
      pendingAmount += earnings;
    }
    // Cancelled bookings with late cancellation fee kept by instructor
    else if (b.status === 'cancelled') {
      const refundAmt = Number(b.refundAmount || 0);
      const keptAmt = Math.max(0, parentPays - refundAmt);
      if (keptAmt > 0) {
        const instructorKept = keptAmt * 0.9;
        totalEarned += instructorKept;

        if (isTargetYear) {
          monthlyEarnings[bMonth] += instructorKept;
        }

        if (isTargetYear && bMonth === safeMonthIndex) {
          monthLateCancellationFees += instructorKept;
          monthPlatformFee += (keptAmt - instructorKept);
        }
      }
    }
  }

  // Calculate total completed or pending withdrawals
  let totalWithdrawn = 0;
  for (const t of explicitTransactions) {
    if (t.type === 'withdrawal' && (t.status === 'completed' || t.status === 'pending')) {
      totalWithdrawn += Math.abs(Number(t.netAmount || 0));
    }
  }

  const availableToWithdraw = Math.max(0, totalEarned - totalWithdrawn);

  // Instructor member since date
  const joinedDate = parseDate(instructor.createdAt) || new Date('2026-07-01');
  const joinedMonth = monthsFull[joinedDate.getMonth()];
  const joinedYear = joinedDate.getFullYear();
  const sinceText = `Since ${joinedMonth} ${joinedYear} · ${completedLessonsCount || instructor.lessonsTaught || 0} lessons`;

  // 12-month chart data
  const chart = monthsShort.map((m, idx) => ({
    month: m,
    amount: Math.round(monthlyEarnings[idx] * 100) / 100
  }));

  // Month breakdown calculation
  const monthName = monthsFull[safeMonthIndex];
  const monthNetEarnings = Math.max(0, (monthLessonsGross + monthLateCancellationFees) - monthPlatformFee);

  return {
    totalEarned: Math.round(totalEarned * 100) / 100,
    availableToWithdraw: Math.round(availableToWithdraw * 100) / 100,
    pending: Math.round(pendingAmount * 100) / 100,
    since: sinceText,
    chart,
    breakdown: {
      month: monthName,
      year: targetYear,
      lessonsCount: monthLessonsCount,
      lessonsTaught: Math.round(monthLessonsGross * 100) / 100,
      lateCancellationFees: Math.round(monthLateCancellationFees * 100) / 100,
      platformFee: Math.round(monthPlatformFee * 100) / 100,
      netEarnings: Math.round(monthNetEarnings * 100) / 100
    }
  };
};

/**
 * 2. Get Instructor Transactions History Data (Figma Node 40012438:8506)
 */
const getInstructorTransactionsHistoryService = async (instructorId, options = {}) => {
  if (!mongoose.Types.ObjectId.isValid(instructorId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid Instructor ID');
  }

  // 1. Fetch completed & late-cancellation bookings for this instructor
  const bookings = await Booking.find({
    instructor: instructorId,
    $or: [
      { status: 'completed' },
      { clientCompleted: true, instructorCompleted: true },
      { status: 'cancelled' }
    ]
  }).populate('client', 'fullName email image');

  // 2. Fetch explicit transactions (e.g. withdrawals)
  const explicitTransactions = await Transaction.find({
    instructor: instructorId
  }).populate('client', 'fullName email image');

  const allItems = [];

  // Convert bookings into normalized transaction cards
  for (const b of bookings) {
    const parentPays = Number(b.pricing?.totalAmount || 0);
    const earnings = Number(b.pricing?.instructorEarnings || (parentPays * 0.85));
    const bDate = parseDate(b.date) || parseDate(b.createdAt) || new Date();
    const duration = b.duration || 60;
    const clientName = b.client?.fullName || 'Client';
    const clientImage = b.client?.image || null;

    if (b.status === 'completed' || (b.clientCompleted && b.instructorCompleted)) {
      allItems.push({
        _id: b._id,
        bookingId: b.bookingId || '',
        type: 'lesson_payout',
        title: clientName,
        subtitle: `${duration}-min private · ${monthsShort[bDate.getMonth()]} ${bDate.getDate()}`,
        avatar: clientImage,
        amount: Math.round(earnings * 100) / 100,
        date: bDate
      });
    } else if (b.status === 'cancelled') {
      const refundAmt = Number(b.refundAmount || 0);
      const keptAmt = Math.max(0, parentPays - refundAmt);
      if (keptAmt > 0) {
        const feeEarned = keptAmt * 0.9;
        allItems.push({
          _id: b._id,
          bookingId: b.bookingId || '',
          type: 'late_cancellation',
          title: 'Late cancellation',
          subtitle: `${clientName} · ${monthsShort[bDate.getMonth()]} ${bDate.getDate()}`,
          avatar: clientImage,
          amount: Math.round(feeEarned * 100) / 100,
          date: bDate
        });
      }
    }
  }

  // Convert explicit transactions (e.g. withdrawals)
  for (const t of explicitTransactions) {
    const tDate = parseDate(t.date) || parseDate(t.createdAt) || new Date();
    const isWithdrawal = t.type === 'withdrawal';
    const netAmt = Number(t.netAmount || 0);
    const amountVal = isWithdrawal ? -Math.abs(netAmt) : Math.abs(netAmt);

    allItems.push({
      _id: t._id,
      transactionId: t.transactionId || '',
      type: t.type,
      title: t.title || (isWithdrawal ? 'Withdrawal' : 'Payment'),
      subtitle: t.subtitle || (isWithdrawal
        ? `${t.bankDetails?.bankName || 'Chase'} ·· ${t.bankDetails?.accountLast4 || '8821'} · ${monthsShort[tDate.getMonth()]} ${tDate.getDate()}`
        : `${monthsShort[tDate.getMonth()]} ${tDate.getDate()}`),
      avatar: t.avatar || (isWithdrawal ? null : (t.client?.image || null)),
      amount: Math.round(amountVal * 100) / 100,
      date: tDate
    });
  }

  // Sort descending by date
  allItems.sort((a, b) => b.date.getTime() - a.date.getTime());

  // Group by Month (e.g. August 2026, July 2026)
  const groupedMap = new Map();

  for (const item of allItems) {
    const monthKey = `${monthsFull[item.date.getMonth()]} ${item.date.getFullYear()}`;
    if (!groupedMap.has(monthKey)) {
      groupedMap.set(monthKey, {
        month: monthKey,
        total: 0,
        transactions: []
      });
    }

    const group = groupedMap.get(monthKey);
    group.transactions.push(item);
    group.total += item.amount;
  }

  const groups = Array.from(groupedMap.values()).map((g) => ({
    month: g.month,
    total: Math.round(g.total * 100) / 100,
    transactions: g.transactions
  }));

  return {
    totalCount: allItems.length,
    groups
  };
};

/**
 * 3. Instructor Requests Withdrawal
 */
const requestWithdrawalService = async (instructorId, data = {}) => {
  if (!mongoose.Types.ObjectId.isValid(instructorId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid Instructor ID');
  }

  const amount = Number(data.amount);
  if (isNaN(amount) || amount <= 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Please provide a valid withdrawal amount greater than zero');
  }

  // Check available balance
  const overview = await getInstructorEarningsOverviewService(instructorId);
  const available = overview.availableToWithdraw || 0;

  if (amount > available) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Requested amount ($${amount.toFixed(2)}) exceeds available balance ($${available.toFixed(2)})`
    );
  }

  const bankName = data.bankName || 'Chase';
  const accountLast4 = data.accountLast4 || '8821';
  const now = new Date();
  const dateStr = `${monthsShort[now.getMonth()]} ${now.getDate()}`;

  const transaction = await Transaction.create({
    instructor: instructorId,
    type: 'withdrawal',
    status: 'pending',
    grossAmount: amount,
    platformFee: 0,
    netAmount: -amount,
    isPositive: false,
    title: 'Withdrawal',
    subtitle: `${bankName} ·· ${accountLast4} · ${dateStr}`,
    bankDetails: {
      bankName,
      accountLast4
    },
    availableBalanceAtRequest: available,
    date: now
  });

  return {
    _id: transaction._id,
    transactionId: transaction.transactionId,
    amount: -amount,
    bankName,
    accountLast4,
    status: transaction.status,
    availableBalance: available,
    date: transaction.date
  };
};

/**
 * Date and avatar formatting helpers
 */
const formatRelativeTime = (date) => {
  if (!date) return '';
  const now = new Date();
  const diffMs = now.getTime() - new Date(date).getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) return `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
  if (diffHours > 0) return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`;
  const diffMin = Math.floor(diffMs / (1000 * 60));
  if (diffMin > 0) return `${diffMin} ${diffMin === 1 ? 'minute' : 'minutes'} ago`;
  return 'just now';
};

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
 * 4. Admin - Get Pending Withdrawals (Figma Node 40012563:21572)
 */
const getAdminPendingWithdrawalsService = async (queryParams = {}) => {
  const { search, sortBy = 'date', sortOrder = 'desc', page = 1, limit = 10 } = queryParams;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, parseInt(limit, 10) || 10);
  const skip = (pageNum - 1) * limitNum;

  const query = {
    type: 'withdrawal',
    status: 'pending'
  };

  const sortCriteria = {};
  if (sortBy === 'amount' || sortBy === 'requestedAmount') {
    sortCriteria.grossAmount = sortOrder === 'asc' ? 1 : -1;
  } else {
    sortCriteria.date = sortOrder === 'asc' ? 1 : -1;
  }

  let list = await Transaction.find(query)
    .populate('instructor', 'fullName email image')
    .sort(sortCriteria);

  if (search && search.trim()) {
    const s = search.trim().toLowerCase();
    list = list.filter(
      (t) =>
        t.instructor?.fullName?.toLowerCase().includes(s) ||
        t.instructor?.email?.toLowerCase().includes(s) ||
        t.bankDetails?.bankName?.toLowerCase().includes(s) ||
        t.transactionId?.toLowerCase().includes(s)
    );
  }

  const total = list.length;
  const paginated = list.slice(skip, skip + limitNum);

  const withdrawals = paginated.map((t) => {
    const instructorName = t.instructor?.fullName || 'Instructor';
    const amountVal = Math.abs(t.grossAmount || t.netAmount || 0);
    const availableVal = t.availableBalanceAtRequest || amountVal;

    return {
      _id: t._id,
      transactionId: t.transactionId || '',
      user: {
        _id: t.instructor?._id,
        name: instructorName,
        avatar: t.instructor?.image || null,
        initials: getInitials(instructorName)
      },
      bankName: t.bankDetails?.bankName ? `${t.bankDetails.bankName} Bank` : 'Chase Bank',
      requestedAmount: amountVal,
      availableBalance: availableVal,
      requestDate: t.date,
      requestDateFormatted: formatRelativeTime(t.date),
      status: 'Pending'
    };
  });

  return {
    total,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.ceil(total / limitNum) || 1,
    withdrawals
  };
};

/**
 * 5. Admin - Get Withdrawal History (Figma Node 40012563:22328)
 */
const getAdminWithdrawalHistoryService = async (queryParams = {}) => {
  const { search, status: filterStatus, sortBy = 'actionDate', sortOrder = 'desc', page = 1, limit = 10 } = queryParams;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, parseInt(limit, 10) || 10);
  const skip = (pageNum - 1) * limitNum;

  const query = {
    type: 'withdrawal',
    status: { $in: ['completed', 'rejected'] }
  };

  if (filterStatus && filterStatus !== 'all') {
    query.status = filterStatus.toLowerCase();
  }

  const sortCriteria = {};
  if (sortBy === 'amount') {
    sortCriteria.grossAmount = sortOrder === 'asc' ? 1 : -1;
  } else {
    sortCriteria.actionDate = sortOrder === 'asc' ? 1 : -1;
  }

  let list = await Transaction.find(query)
    .populate('instructor', 'fullName email image')
    .sort(sortCriteria);

  if (search && search.trim()) {
    const s = search.trim().toLowerCase();
    list = list.filter(
      (t) =>
        t.instructor?.fullName?.toLowerCase().includes(s) ||
        t.instructor?.email?.toLowerCase().includes(s) ||
        t.bankDetails?.bankName?.toLowerCase().includes(s) ||
        t.transactionId?.toLowerCase().includes(s)
    );
  }

  const total = list.length;
  const paginated = list.slice(skip, skip + limitNum);

  const withdrawals = paginated.map((t) => {
    const instructorName = t.instructor?.fullName || 'Instructor';
    const amountVal = Math.abs(t.grossAmount || t.netAmount || 0);
    const actionDateVal = t.actionDate || t.updatedAt || t.date;
    const isCompleted = t.status === 'completed';

    return {
      _id: t._id,
      transactionId: t.transactionId || '',
      user: {
        _id: t.instructor?._id,
        name: instructorName,
        avatar: t.instructor?.image || null,
        initials: getInitials(instructorName)
      },
      bankName: t.bankDetails?.bankName ? `${t.bankDetails.bankName} Bank` : 'Chase Bank',
      amount: amountVal,
      requestDate: t.date,
      requestDateFormatted: formatDateShort(t.date),
      actionDate: actionDateVal,
      actionDateFormatted: formatDateShort(actionDateVal),
      status: isCompleted ? 'Completed' : 'Rejected',
      reason: !isCompleted && t.rejectionReason ? t.rejectionReason : '—'
    };
  });

  return {
    total,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.ceil(total / limitNum) || 1,
    withdrawals
  };
};

/**
 * 6. Admin - Get Withdrawal Details by ID
 */
const getAdminWithdrawalDetailsService = async (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid Withdrawal ID');
  }

  const withdrawal = await Transaction.findById(id).populate('instructor', 'fullName email image phone about');
  if (!withdrawal || withdrawal.type !== 'withdrawal') {
    throw new ApiError(httpStatus.NOT_FOUND, 'Withdrawal request not found');
  }

  return withdrawal;
};

/**
 * 7. Admin - Action Withdrawal (Approve / Reject)
 */
const adminActionWithdrawalService = async (id, action, body = {}, adminId = null) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid Withdrawal ID');
  }

  const withdrawal = await Transaction.findById(id);
  if (!withdrawal || withdrawal.type !== 'withdrawal') {
    throw new ApiError(httpStatus.NOT_FOUND, 'Withdrawal request not found');
  }

  if (withdrawal.status !== 'pending') {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Cannot ${action} withdrawal. Current status is already '${withdrawal.status}'`
    );
  }

  const normalizedAction = action.toLowerCase();
  const now = new Date();

  if (normalizedAction === 'approve') {
    withdrawal.status = 'completed';
    withdrawal.actionDate = now;
    withdrawal.processedBy = adminId;
    await withdrawal.save();

    return {
      _id: withdrawal._id,
      transactionId: withdrawal.transactionId,
      status: 'Completed',
      actionDate: withdrawal.actionDate,
      message: 'Withdrawal approved successfully'
    };
  }

  if (normalizedAction === 'reject') {
    if (!body.reason || !body.reason.trim()) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'A reason is required to reject a withdrawal');
    }

    withdrawal.status = 'rejected';
    withdrawal.rejectionReason = body.reason.trim();
    withdrawal.actionDate = now;
    withdrawal.processedBy = adminId;
    await withdrawal.save();

    return {
      _id: withdrawal._id,
      transactionId: withdrawal.transactionId,
      status: 'Rejected',
      reason: withdrawal.rejectionReason,
      actionDate: withdrawal.actionDate,
      message: 'Withdrawal rejected successfully'
    };
  }

  throw new ApiError(httpStatus.BAD_REQUEST, "Invalid action. Allowed actions are 'approve' or 'reject'");
};

/**
 * 8. Admin - Get Platform Earnings Overview & Chart (Figma Node 40012563:22986)
 */
const getAdminPlatformEarningsOverviewService = async (queryYear = null) => {
  const now = new Date();
  const targetYear = queryYear ? parseInt(queryYear, 10) : now.getFullYear();

  // Fetch all completed bookings
  const completedBookings = await Booking.find({
    status: 'completed'
  });

  // Fetch all refunds
  const Refund = require('../Booking/refund.model');
  const allRefunds = await Refund.find({ status: { $ne: 'Failed' } });

  let totalPlatformRevenue = 0;
  let revenueFromBookingFees = 0;
  let revenueFromCommissions = 0;

  // Monthly buckets for 12 months (Jan - Dec)
  const monthlyChart = monthsShort.map((m) => ({
    month: m,
    bookingFees: 0,
    commissions: 0,
    total: 0
  }));

  // This month and last month tracking for % trend
  const currentMonthIdx = now.getMonth();
  const previousMonthIdx = currentMonthIdx === 0 ? 11 : currentMonthIdx - 1;
  let currentMonthRevenue = 0;
  let previousMonthRevenue = 0;

  for (const b of completedBookings) {
    const bDate = parseDate(b.date) || parseDate(b.createdAt) || now;
    const isYear = bDate.getFullYear() === targetYear;
    const mIdx = bDate.getMonth();

    const parentPays = Number(b.pricing?.totalAmount || 0);
    const bookingFee = Number(b.pricing?.bookingFee || (parentPays * 0.05));
    const commission = Number(b.pricing?.platformCommission || (parentPays * 0.15));
    const platformEarning = bookingFee + commission;

    totalPlatformRevenue += platformEarning;
    revenueFromBookingFees += bookingFee;
    revenueFromCommissions += commission;

    if (isYear && mIdx >= 0 && mIdx < 12) {
      monthlyChart[mIdx].bookingFees += bookingFee;
      monthlyChart[mIdx].commissions += commission;
      monthlyChart[mIdx].total += platformEarning;
    }

    if (bDate.getFullYear() === now.getFullYear()) {
      if (mIdx === currentMonthIdx) currentMonthRevenue += platformEarning;
      if (mIdx === previousMonthIdx) previousMonthRevenue += platformEarning;
    }
  }

  // Calculate refunds
  let totalRefunds = 0;
  let currentMonthRefunds = 0;

  for (const r of allRefunds) {
    const rDate = parseDate(r.date) || parseDate(r.createdAt) || now;
    const rAmount = Number(r.amount || 0);
    totalRefunds += rAmount;

    if (rDate.getFullYear() === now.getFullYear() && rDate.getMonth() === currentMonthIdx) {
      currentMonthRefunds += rAmount;
    }
  }

  // Also include booking.refundAmount if not tracked in Refund model
  if (allRefunds.length === 0) {
    const refundedBookings = await Booking.find({ refundAmount: { $gt: 0 } });
    for (const rb of refundedBookings) {
      const rbDate = parseDate(rb.date) || parseDate(rb.createdAt) || now;
      const rbAmt = Number(rb.refundAmount || 0);
      totalRefunds += rbAmt;
      if (rbDate.getFullYear() === now.getFullYear() && rbDate.getMonth() === currentMonthIdx) {
        currentMonthRefunds += rbAmt;
      }
    }
  }

  const netAfterRefunds = Math.max(0, totalPlatformRevenue - totalRefunds);

  // Month-over-month trend percentage
  let monthlyTrendPercent = 0;
  if (previousMonthRevenue > 0) {
    monthlyTrendPercent = Math.round(((currentMonthRevenue - previousMonthRevenue) / previousMonthRevenue) * 100);
  } else if (currentMonthRevenue > 0) {
    monthlyTrendPercent = 100;
  }

  // Round chart amounts
  const formattedChart = monthlyChart.map((c) => ({
    month: c.month,
    bookingFees: Math.round(c.bookingFees * 100) / 100,
    commissions: Math.round(c.commissions * 100) / 100,
    total: Math.round(c.total * 100) / 100
  }));

  return {
    kpis: {
      totalPlatformRevenue: Math.round(totalPlatformRevenue * 100) / 100,
      totalPlatformRevenueFormatted: `$${(Math.round(totalPlatformRevenue * 100) / 100).toLocaleString()}`,
      trendText: `${monthlyTrendPercent >= 0 ? '↑' : '↓'} ${Math.abs(monthlyTrendPercent)}% this month`,
      revenueFromBookingFees: Math.round(revenueFromBookingFees * 100) / 100,
      revenueFromBookingFeesFormatted: `$${(Math.round(revenueFromBookingFees * 100) / 100).toLocaleString()}`,
      bookingFeeSubtitle: '5% client-side fee',
      revenueFromCommissions: Math.round(revenueFromCommissions * 100) / 100,
      revenueFromCommissionsFormatted: `$${(Math.round(revenueFromCommissions * 100) / 100).toLocaleString()}`,
      commissionSubtitle: '15% instructor-side',
      netAfterRefunds: Math.round(netAfterRefunds * 100) / 100,
      netAfterRefundsFormatted: `$${(Math.round(netAfterRefunds * 100) / 100).toLocaleString()}`,
      refundsSubtitle: `After $${Math.round(currentMonthRefunds)} in refunds this month`
    },
    year: targetYear,
    chart: formattedChart
  };
};

/**
 * 9. Admin - Get Platform Transaction Breakdown Table (Figma Node 40012563:22986)
 */
const getAdminPlatformTransactionsService = async (queryParams = {}) => {
  const { search, sortBy = 'date', sortOrder = 'desc', page = 1, limit = 10 } = queryParams;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, parseInt(limit, 10) || 10);
  const skip = (pageNum - 1) * limitNum;

  const sortCriteria = {};
  if (sortBy === 'lessonPrice') {
    sortCriteria['pricing.totalAmount'] = sortOrder === 'asc' ? 1 : -1;
  } else {
    sortCriteria.date = sortOrder === 'asc' ? 1 : -1;
  }

  let list = await Booking.find({})
    .populate('client', 'fullName email image')
    .populate('instructor', 'fullName email image')
    .sort(sortCriteria);

  if (search && search.trim()) {
    const s = search.trim().toLowerCase();
    list = list.filter(
      (b) =>
        b.bookingId?.toLowerCase().includes(s) ||
        b.client?.fullName?.toLowerCase().includes(s) ||
        b.client?.email?.toLowerCase().includes(s) ||
        b.instructor?.fullName?.toLowerCase().includes(s) ||
        b.instructor?.email?.toLowerCase().includes(s)
    );
  }

  const total = list.length;
  const paginated = list.slice(skip, skip + limitNum);

  const transactions = paginated.map((b) => {
    const clientName = b.client?.fullName || 'Client';
    const instructorName = b.instructor?.fullName || 'Instructor';
    const parentPays = Number(b.pricing?.totalAmount || 0);
    const bookingFee = Number(b.pricing?.bookingFee || (parentPays * 0.05));
    const commission = Number(b.pricing?.platformCommission || (parentPays * 0.15));
    const lessonPrice = Number(b.pricing?.subtotal || b.pricing?.lessonRate || Math.max(0, parentPays - bookingFee));
    const platformEarning = bookingFee + commission;
    const bDate = parseDate(b.date) || parseDate(b.createdAt) || new Date();

    const statusBadge = b.status === 'completed' ? 'Active' : 'Pending';

    return {
      _id: b._id,
      bookingId: b.bookingId || '',
      client: {
        _id: b.client?._id,
        name: clientName,
        avatar: b.client?.image || null,
        initials: getInitials(clientName)
      },
      instructor: {
        _id: b.instructor?._id,
        name: instructorName,
        avatar: b.instructor?.image || null,
        initials: getInitials(instructorName)
      },
      lessonPrice: Math.round(lessonPrice * 100) / 100,
      lessonPriceFormatted: `$${(Math.round(lessonPrice * 100) / 100).toFixed(2)}`,
      bookingFee: Math.round(bookingFee * 100) / 100,
      bookingFeeFormatted: `+$${(Math.round(bookingFee * 100) / 100).toFixed(2)}`,
      commission: Math.round(commission * 100) / 100,
      commissionFormatted: `+$${(Math.round(commission * 100) / 100).toFixed(2)}`,
      platformEarning: Math.round(platformEarning * 100) / 100,
      platformEarningFormatted: `$${(Math.round(platformEarning * 100) / 100).toFixed(2)}`,
      status: statusBadge,
      date: bDate,
      dateFormatted: formatDateShort(bDate)
    };
  });

  return {
    total,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.ceil(total / limitNum) || 1,
    transactions
  };
};

module.exports = {
  getInstructorEarningsOverviewService,
  getInstructorTransactionsHistoryService,
  requestWithdrawalService,
  getAdminPendingWithdrawalsService,
  getAdminWithdrawalHistoryService,
  getAdminWithdrawalDetailsService,
  adminActionWithdrawalService,
  getAdminPlatformEarningsOverviewService,
  getAdminPlatformTransactionsService
};

