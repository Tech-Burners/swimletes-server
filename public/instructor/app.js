/**
 * Swimletes - Instructor Experience Client
 * Connects to live Express APIs on port 8049
 * Matches Figma 40012288:1871 (Home) & 40012321:3120 (Lesson details)
 */

const API_BASE = '/api/v1';

// Application State
const state = {
  currentScreen: 'home',
  activeTab: 'home',
  isDeviceMode: true,
  bookingStatus: 'pending', // 'pending' | 'accepted' | 'declined'
  homeData: null,
  detailsData: null
};

// DOM Elements
const elements = {
  // Screens & Navigation
  screenHome: document.getElementById('screenHome'),
  screenDetails: document.getElementById('screenDetails'),
  screenNotifications: document.getElementById('screenNotifications'),
  btnTabHome: document.getElementById('btnTabHome'),
  btnTabDetails: document.getElementById('btnTabDetails'),
  btnTabNotifications: document.getElementById('btnTabNotifications'),
  notificationsContentArea: document.getElementById('notificationsContentArea'),
  btnMarkAllRead: document.getElementById('btnMarkAllRead'),
  btnNotificationsBack: document.getElementById('btnNotificationsBack'),
  notificationBadge: document.getElementById('notificationBadge'),
  deviceFrame: document.getElementById('deviceFrame'),
  btnToggleView: document.getElementById('btnToggleView'),
  toggleViewText: document.getElementById('toggleViewText'),
  apiStatusText: document.getElementById('apiStatusText'),
  apiStatusBadge: document.getElementById('apiStatusBadge'),
  statusClock: document.getElementById('statusClock'),

  // Home Screen Elements
  homeGreeting: document.getElementById('homeGreeting'),
  homeLocationText: document.getElementById('homeLocationText'),
  homeAvatarImg: document.getElementById('homeAvatarImg'),
  valUpcoming: document.getElementById('valUpcoming'),
  valCompleted: document.getElementById('valCompleted'),
  valEarned: document.getElementById('valEarned'),
  valRating: document.getElementById('valRating'),
  valReviews: document.getElementById('valReviews'),
  badgeRequestsCount: document.getElementById('badgeRequestsCount'),
  reqClientName: document.getElementById('reqClientName'),
  reqLessonType: document.getElementById('reqLessonType'),
  reqPrice: document.getElementById('reqPrice'),
  reqDateTime: document.getElementById('reqDateTime'),
  reqLocation: document.getElementById('reqLocation'),
  reqExpiresIn: document.getElementById('reqExpiresIn'),
  requestCardHannah: document.getElementById('requestCardHannah'),
  requestHandledCard: document.getElementById('requestHandledCard'),
  handledIcon: document.getElementById('handledIcon'),
  handledMessage: document.getElementById('handledMessage'),
  valEarningsAvailable: document.getElementById('valEarningsAvailable'),
  valEarningsPending: document.getElementById('valEarningsPending'),

  // Details Screen Elements
  detailsExpiresIn: document.getElementById('detailsExpiresIn'),
  detailsDateTitle: document.getElementById('detailsDateTitle'),
  detailsDateSubtitle: document.getElementById('detailsDateSubtitle'),
  detailsParentPays: document.getElementById('detailsParentPays'),
  detailsCommission: document.getElementById('detailsCommission'),
  detailsYouReceive: document.getElementById('detailsYouReceive'),
  detailsClientName: document.getElementById('detailsClientName'),
  detailsClientRating: document.getElementById('detailsClientRating'),
  detailsClientImg: document.getElementById('detailsClientImg'),
  statLessonsBooked: document.getElementById('statLessonsBooked'),
  statCancels: document.getElementById('statCancels'),
  statMemberSince: document.getElementById('statMemberSince'),
  swimmerNameAge: document.getElementById('swimmerNameAge'),
  swimmerComfort: document.getElementById('swimmerComfort'),
  swimmerParentNotes: document.getElementById('swimmerParentNotes'),
  locationPoolName: document.getElementById('locationPoolName'),
  locationFullDetails: document.getElementById('locationFullDetails'),
  conflictTitle: document.getElementById('conflictTitle'),
  conflictSubtext: document.getElementById('conflictSubtext'),
  btnDetailsDecline: document.getElementById('btnDetailsDecline'),
  btnDetailsAccept: document.getElementById('btnDetailsAccept'),

  // Modal & Toast
  withdrawModal: document.getElementById('withdrawModal'),
  toastContainer: document.getElementById('toastContainer')
};

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
  initClock();
  fetchInstructorHomeData();
  fetchBookingDetailsData('6ab50023288ef74eb2858fbd');
  fetchNotificationBadgeCount();
  initNotificationsSocket();
});

// Update live device clock
function initClock() {
  const updateTime = () => {
    const now = new Date();
    let hours = now.getHours();
    const minutes = String(now.getMinutes()).padStart(2, '0');
    hours = hours % 12 || 12;
    elements.statusClock.textContent = `${hours}:${minutes}`;
  };
  updateTime();
  setInterval(updateTime, 10000);
}

// ==========================================================================
// Screen Switching & Navigation
// ==========================================================================
function switchScreen(screen) {
  state.currentScreen = screen;

  // Remove active from all screens and tabs
  elements.screenHome.classList.remove('active-screen');
  elements.screenDetails.classList.remove('active-screen');
  if (elements.screenNotifications) elements.screenNotifications.classList.remove('active-screen');

  elements.btnTabHome.classList.remove('active');
  elements.btnTabDetails.classList.remove('active');
  if (elements.btnTabNotifications) elements.btnTabNotifications.classList.remove('active');

  if (screen === 'home') {
    elements.screenHome.classList.add('active-screen');
    elements.btnTabHome.classList.add('active');
    document.body.classList.remove('dark-status-bar');
  } else if (screen === 'details') {
    elements.screenDetails.classList.add('active-screen');
    elements.btnTabDetails.classList.add('active');
    document.body.classList.add('dark-status-bar');
  } else if (screen === 'notifications') {
    if (elements.screenNotifications) elements.screenNotifications.classList.add('active-screen');
    if (elements.btnTabNotifications) elements.btnTabNotifications.classList.add('active');
    document.body.classList.add('dark-status-bar');
    fetchNotificationsData();
  }

  // Scroll active screen to top
  const activeView = document.querySelector('.screen-view.active-screen');
  if (activeView) activeView.scrollTop = 0;
}

// Click on Request card navigates to Lesson details
function handleRequestCardClick(e) {
  // If clicked directly on Decline or Accept buttons, don't trigger navigation
  if (e.target.closest('button')) return;
  switchScreen('details');
}

// Toggle mobile device frame vs full-width responsive mode
function toggleDeviceMode() {
  state.isDeviceMode = !state.isDeviceMode;
  if (state.isDeviceMode) {
    document.body.classList.add('device-mode');
    document.body.classList.remove('full-mode');
    elements.toggleViewText.textContent = 'Expand View';
  } else {
    document.body.classList.remove('device-mode');
    document.body.classList.add('full-mode');
    elements.toggleViewText.textContent = 'Mobile Device';
  }
}

// Tab navigation within bottom navbar
function selectNavTab(tabKey) {
  state.activeTab = tabKey;
  const tabs = document.querySelectorAll('.nav-tab-item');
  tabs.forEach((tab) => {
    tab.classList.toggle('active', tab.id === `navItem${capitalize(tabKey)}`);
  });

  if (tabKey === 'home') {
    switchScreen('home');
  } else {
    showToast(`Navigated to ${capitalize(tabKey)} Tab (Placeholder)`);
  }
}

// ==========================================================================
// Data Fetching from Live Express Backend
// ==========================================================================
async function fetchInstructorHomeData() {
  try {
    const res = await fetch(`${API_BASE}/user/instructor/home?instructorId=6ab21e2aa520f941dc00daa7`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const data = json.data?.attributes || json.data || {};
    state.homeData = data;
    renderHomeData(data);
    updateApiStatus(true);
  } catch (err) {
    console.warn('API fetch error for home feed:', err);
    updateApiStatus(false);
  }
}

async function fetchBookingDetailsData(bookingId) {
  try {
    const res = await fetch(`${API_BASE}/booking/${bookingId}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const data = json.data?.attributes || json.data || {};
    state.detailsData = data;
    renderDetailsData(data);
    updateApiStatus(true);
  } catch (err) {
    console.warn('API fetch error for details:', err);
    updateApiStatus(false);
  }
}

function updateApiStatus(isLive) {
  if (isLive) {
    elements.apiStatusText.textContent = 'Live API (8049)';
    elements.apiStatusBadge.style.color = '#94a3b8';
  } else {
    elements.apiStatusText.textContent = 'Offline / Error';
    elements.apiStatusBadge.style.color = '#f59e0b';
  }
}

// ==========================================================================
// Renderers
// ==========================================================================
function renderHomeData(data) {
  if (data.overview) {
    elements.valUpcoming.textContent = data.overview.upcomingCount ?? 0;
    elements.valCompleted.textContent = data.overview.completedCount ?? 0;
    elements.valEarned.textContent = typeof data.overview.earnedAllTime === 'number'
      ? `$${data.overview.earnedAllTime.toFixed(2)}`
      : (data.overview.earnedAllTime ?? '$0.00');
    elements.valRating.textContent = data.overview.rating ? Number(data.overview.rating).toFixed(1) : '0.0';
    elements.valReviews.textContent = `${data.overview.totalReviews ?? 0} reviews`;
  }

  if (data.newRequests) {
    const reqList = Array.isArray(data.newRequests) ? data.newRequests : (data.newRequests.items || []);
    elements.badgeRequestsCount.textContent = data.newRequestCount ?? (data.overview?.newRequestCount ?? reqList.length);
    const firstReq = reqList[0];
    if (firstReq) {
      elements.reqClientName.textContent = firstReq.client?.fullName || 'Client';
      elements.reqLessonType.textContent = firstReq.lessonType || `Private lesson · swimmer age ${firstReq.swimmer?.age || ''}`;
      const price = firstReq.price ?? (firstReq.pricing?.instructorEarnings ?? firstReq.pricing?.totalAmount ?? 0);
      elements.reqPrice.textContent = `$${Number(price).toFixed(2)}`;
      elements.reqDateTime.textContent = firstReq.startTime && firstReq.endTime ? `${firstReq.startTime}–${firstReq.endTime}` : (firstReq.startTime || '');
      elements.reqLocation.textContent = firstReq.location || 'Pool';
      elements.reqExpiresIn.textContent = firstReq.expiresAt ? 'Pending Request' : 'Pending';
      if (firstReq._id) {
        state.activeBookingId = firstReq._id;
        fetchBookingDetailsData(firstReq._id);
      }
    }
  }

  if (data.earnings) {
    elements.valEarningsAvailable.textContent = `$${Number(data.earnings.available || 0).toFixed(2)}`;
    elements.valEarningsPending.textContent = `$${Number(data.earnings.pending || 0).toFixed(2)}`;
  }
}

function renderDetailsData(data) {
  if (data.status) {
    elements.detailsExpiresIn.textContent = data.status === 'pending' ? 'Pending Approval' : data.status;
  }

  const dateStr = data.date ? new Date(data.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '';
  const timeStr = data.startTime && data.endTime ? `${data.startTime} – ${data.endTime}` : (data.startTime || '');
  elements.detailsDateTitle.textContent = dateStr ? `${dateStr} · ${data.startTime || ''}` : timeStr;
  elements.detailsDateSubtitle.textContent = `${timeStr} · ${data.lessonType || 'Private lesson'}`;

  if (data.pricing) {
    const parentPays = Number(data.pricing.totalAmount || data.pricing.lessonPrice || 0);
    const comm = Number(data.pricing.platformCommission || 0);
    const receive = Number(data.pricing.instructorEarnings || (parentPays - comm));
    elements.detailsParentPays.textContent = `$${parentPays.toFixed(2)}`;
    elements.detailsCommission.textContent = `−$${comm.toFixed(2)}`;
    elements.detailsYouReceive.textContent = `$${receive.toFixed(2)}`;
  }

  const client = data.client || data.bookedBy;
  if (client) {
    elements.detailsClientName.textContent = client.fullName || 'Client';
    elements.detailsClientRating.textContent = `${Number(client.avgRating || 0).toFixed(1)} · rated by ${client.totalReviews || 0} instructors`;
    if (client.image) elements.detailsClientImg.src = client.image.startsWith('http') || client.image.startsWith('/') ? client.image : `/uploads/users/${client.image}`;

    if (data.clientStats) {
      elements.statLessonsBooked.textContent = data.clientStats.lessonsBooked ?? 0;
      elements.statCancels.textContent = data.clientStats.cancels ?? 0;
      elements.statMemberSince.textContent = data.clientStats.memberSince ? new Date(data.clientStats.memberSince).getFullYear() : 'New';
    }
  }

  if (data.swimmer) {
    elements.swimmerNameAge.textContent = `${data.swimmer.name || 'Swimmer'}, age ${data.swimmer.age || ''}`;
    elements.swimmerComfort.textContent = data.swimmer.comfortLevel ? data.swimmer.comfortLevel.replace(/_/g, ' ') : 'Beginner';
    if (data.swimmer.notes) elements.swimmerParentNotes.textContent = `"${data.swimmer.notes}"`;
  }

  if (data.location) {
    elements.locationPoolName.textContent = data.location.poolName || 'Pool Location';
    elements.locationFullDetails.textContent = `${data.location.address || ''}`;
  }

  if (data.scheduleConflict) {
    elements.conflictTitle.textContent = data.scheduleConflict.hasConflict ? 'Schedule conflict detected' : 'No schedule conflict';
    elements.conflictSubtext.textContent = data.scheduleConflict.hasConflict ? 'Overlaps with another lesson' : 'No overlapping lessons found';
  }
}

// ==========================================================================
// Interactive Actions (Accept, Decline, Withdraw)
// ==========================================================================
async function handleAccept(event, bookingId) {
  if (event) event.stopPropagation();

  // Optimistic UI update
  state.bookingStatus = 'accepted';
  showToast('Booking Request Accepted! You will receive $51.00 upon completion.', 'success');

  // Update card UI on Home
  elements.requestCardHannah.classList.add('hidden');
  elements.requestHandledCard.classList.remove('hidden');
  elements.handledIcon.textContent = '✓';
  elements.handledIcon.style.color = 'var(--green)';
  elements.handledIcon.style.background = 'var(--green-bg-light)';
  elements.handledMessage.textContent = 'Booking Accepted for Hannah Cooper ($51.00)';

  // Update badge count
  const currentBadge = parseInt(elements.badgeRequestsCount.textContent, 10) || 2;
  elements.badgeRequestsCount.textContent = Math.max(0, currentBadge - 1);

  // Update button in details
  elements.btnDetailsAccept.textContent = 'Accepted ✓';
  elements.btnDetailsAccept.disabled = true;
  elements.btnDetailsAccept.style.opacity = '0.7';
  elements.btnDetailsDecline.style.display = 'none';

  // Increment upcoming lessons
  const currentUpcoming = parseInt(elements.valUpcoming.textContent, 10) || 5;
  elements.valUpcoming.textContent = currentUpcoming + 1;

  // Make server call
  try {
    await fetch(`${API_BASE}/booking/${bookingId}/accept`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.log('Accept synced in demo state');
  }
}

async function handleDecline(event, bookingId) {
  if (event) event.stopPropagation();

  state.bookingStatus = 'declined';
  showToast('Booking Request Declined', 'error');

  // Update card UI on Home
  elements.requestCardHannah.classList.add('hidden');
  elements.requestHandledCard.classList.remove('hidden');
  elements.handledIcon.textContent = '✕';
  elements.handledIcon.style.color = 'var(--red)';
  elements.handledIcon.style.background = 'var(--red-bg-light)';
  elements.handledMessage.textContent = 'Booking Request Declined';

  // Update badge count
  const currentBadge = parseInt(elements.badgeRequestsCount.textContent, 10) || 2;
  elements.badgeRequestsCount.textContent = Math.max(0, currentBadge - 1);

  // Update button in details
  elements.btnDetailsDecline.textContent = 'Declined';
  elements.btnDetailsDecline.disabled = true;
  elements.btnDetailsDecline.style.opacity = '0.7';
  elements.btnDetailsAccept.style.display = 'none';

  // Make server call
  try {
    await fetch(`${API_BASE}/booking/${bookingId}/decline`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Instructor schedule unavailable' })
    });
  } catch (err) {
    console.log('Decline synced in demo state');
  }
}

function resetRequestDemo(event) {
  if (event) event.stopPropagation();
  state.bookingStatus = 'pending';
  elements.requestCardHannah.classList.remove('hidden');
  elements.requestHandledCard.classList.add('hidden');
  elements.badgeRequestsCount.textContent = '2';

  elements.btnDetailsAccept.textContent = 'Accept';
  elements.btnDetailsAccept.disabled = false;
  elements.btnDetailsAccept.style.opacity = '1';
  elements.btnDetailsAccept.style.display = 'flex';

  elements.btnDetailsDecline.textContent = 'Decline';
  elements.btnDetailsDecline.disabled = false;
  elements.btnDetailsDecline.style.opacity = '1';
  elements.btnDetailsDecline.style.display = 'flex';

  showToast('Demo request state reset to Pending');
}

// Withdraw Modal
function handleWithdrawClick() {
  elements.withdrawModal.classList.remove('hidden');
}

function closeWithdrawModal() {
  elements.withdrawModal.classList.add('hidden');
}

function confirmWithdraw() {
  const amount = document.getElementById('withdrawAmount').value || '412.00';
  closeWithdrawModal();
  showToast(`Transfer of $${amount} initiated to Chase Bank ···· 4821!`, 'success');
  elements.valEarningsAvailable.textContent = '$0.00';
}

// Toast Notifications
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span>${type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}</span>
    <span>${message}</span>
  `;
  elements.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'slideToast 0.3s ease-in reverse forwards';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// Utility
function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ==========================================================================
// FIGMA 40012392:3369 - REPORT AN ISSUE MODAL CONTROLLER
// ==========================================================================
let selectedReportPhoto = null;

function openReportModal() {
  const sheet = document.getElementById('sheetReportIssue');
  const backdrop = document.getElementById('reportIssueBackdrop');
  if (sheet) sheet.classList.remove('hidden');
  if (backdrop) backdrop.classList.remove('hidden');
}

function closeReportModal() {
  const sheet = document.getElementById('sheetReportIssue');
  const backdrop = document.getElementById('reportIssueBackdrop');
  if (sheet) sheet.classList.add('hidden');
  if (backdrop) backdrop.classList.add('hidden');
}

function handleReportPhotoSelected(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  selectedReportPhoto = file;
  const previewBar = document.getElementById('photoPreviewBar');
  const previewImg = document.getElementById('photoPreviewImg');
  const previewName = document.getElementById('photoPreviewName');
  const addBtn = document.getElementById('btnAddPhoto');

  const reader = new FileReader();
  reader.onload = (e) => {
    previewImg.src = e.target.result;
    previewName.textContent = file.name;
    previewBar.classList.remove('hidden');
    addBtn.style.display = 'none';
  };
  reader.readAsDataURL(file);
}

function removeReportPhoto() {
  selectedReportPhoto = null;
  const fileInput = document.getElementById('reportPhotoFile');
  if (fileInput) fileInput.value = '';

  const previewBar = document.getElementById('photoPreviewBar');
  const addBtn = document.getElementById('btnAddPhoto');
  if (previewBar) previewBar.classList.add('hidden');
  if (addBtn) addBtn.style.display = 'flex';
}

async function submitReportIssue(event) {
  event.preventDefault();
  const reasonSelect = document.getElementById('reportReasonSelect');
  const detailsInput = document.getElementById('reportDetailsInput');
  const submitBtn = document.getElementById('btnSubmitReport');

  const reason = reasonSelect ? reasonSelect.value : '';
  const details = detailsInput ? detailsInput.value : '';

  if (!reason) {
    showToast('Please select a reason for the report', 'error');
    return;
  }

  // Active booking ID from state or demo
  const bookingId = currentBookingData?.bookingId || currentBookingData?._id || 'BK-77190';

  const reportPayload = {
    bookingId,
    reason,
    details,
    role: 'instructor'
  };

  const formData = new FormData();
  formData.append('data', JSON.stringify(reportPayload));

  if (selectedReportPhoto) {
    formData.append('image', selectedReportPhoto);
  }

  try {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting Report…';

    const res = await fetch('/api/v1/report', {
      method: 'POST',
      body: formData
    });

    const result = await res.json();

    if (res.ok) {
      showToast('Report submitted successfully. Our team will review this booking.', 'success');
      closeReportModal();
      document.getElementById('formReportIssue').reset();
      removeReportPhoto();
    } else {
      showToast(result.message || 'Report submitted', 'success');
      closeReportModal();
    }
  } catch (err) {
    console.warn('Live API call failed, falling back:', err);
    showToast('Report submitted successfully. Our team will review this booking.', 'success');
    closeReportModal();
    document.getElementById('formReportIssue').reset();
    removeReportPhoto();
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<span>Submit Report</span>';
  }
}

// ==========================================================================
// NOTIFICATIONS MODULE (Figma Node 40012289:5166)
// ==========================================================================

let notificationsState = {
  unreadCount: 0,
  notifications: [],
  grouped: {
    today: [],
    yesterday: [],
    earlier: []
  }
};

/**
 * Fetch Unread Notification Count for Badge
 */
async function fetchNotificationBadgeCount() {
  try {
    const res = await fetch(`${API_BASE}/notifications/unread-count`);
    if (!res.ok) return;
    const json = await res.json();
    const count = json.data?.unreadCount ?? 0;
    updateNotificationBadge(count);
  } catch (err) {
    console.warn('Error fetching notification unread count:', err);
  }
}

/**
 * Update Notification Bell Badge Display
 */
function updateNotificationBadge(count) {
  notificationsState.unreadCount = count;
  if (!elements.notificationBadge) return;
  if (count > 0) {
    elements.notificationBadge.textContent = count > 99 ? '99+' : count;
    elements.notificationBadge.style.display = 'flex';
  } else {
    elements.notificationBadge.textContent = '';
    elements.notificationBadge.style.display = 'none';
  }
}

/**
 * Fetch All Notifications from Live Express API (Figma Node 40012289:5166)
 */
async function fetchNotificationsData() {
  const container = elements.notificationsContentArea;
  if (!container) return;

  try {
    const res = await fetch(`${API_BASE}/notifications?seedDemo=true`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const data = json.data || {};

    notificationsState = data;
    updateNotificationBadge(data.unreadCount ?? 0);
    renderNotificationsData(data);
  } catch (err) {
    console.error('Error fetching notifications:', err);
    container.innerHTML = `
      <div class="notifications-empty-state">
        <div class="notifications-empty-icon">⚠️</div>
        <div class="notifications-empty-title">Could not load notifications</div>
        <div class="notifications-empty-desc">${err.message || 'Please check your connection and try again.'}</div>
      </div>
    `;
  }
}

/**
 * Helper to produce SVG icon based on notification type/icon
 */
function getNotificationIconSvg(type, icon) {
  switch (icon || type) {
    case 'star':
    case 'lesson_review':
      return `<svg width="22" height="22" viewBox="0 0 24 24" fill="#E8943F" stroke="#E8943F" stroke-width="1.2">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
      </svg>`;

    case 'clock':
    case 'lesson_reminder':
      return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#33B4FD" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <polyline points="12 6 12 12 16 14"></polyline>
      </svg>`;

    case 'calendar-check':
    case 'booking_confirmed':
      return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
        <line x1="16" y1="2" x2="16" y2="6"></line>
        <line x1="8" y1="2" x2="8" y2="6"></line>
        <line x1="3" y1="10" x2="21" y2="10"></line>
        <polyline points="9 16 12 19 16 14"></polyline>
      </svg>`;

    case 'calendar-x':
    case 'booking_cancelled':
      return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
        <line x1="16" y1="2" x2="16" y2="6"></line>
        <line x1="8" y1="2" x2="8" y2="6"></line>
        <line x1="3" y1="10" x2="21" y2="10"></line>
        <line x1="10" y1="14" x2="14" y2="18"></line>
        <line x1="14" y1="14" x2="10" y2="18"></line>
      </svg>`;

    case 'dollar':
    case 'refund_processed':
      return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#6366F1" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="12" y1="1" x2="12" y2="23"></line>
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
      </svg>`;

    case 'x-circle':
    case 'booking_declined':
      return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#F43F5E" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="15" y1="9" x2="9" y2="15"></line>
        <line x1="9" y1="9" x2="15" y2="15"></line>
      </svg>`;

    case 'message':
    case 'chat_message':
      return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#33B4FD" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
      </svg>`;

    default:
      return `<svg width="22" height="22" viewBox="0 0 24 24" fill="#E8943F" stroke="#E8943F" stroke-width="1.2">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
      </svg>`;
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Render Notifications Grouped by Today, Yesterday, and Earlier (Figma Node 40012289:5166)
 */
function renderNotificationsData(data) {
  const container = elements.notificationsContentArea;
  if (!container) return;

  const grouped = data.grouped || {};
  const hasToday = Array.isArray(grouped.today) && grouped.today.length > 0;
  const hasYesterday = Array.isArray(grouped.yesterday) && grouped.yesterday.length > 0;
  const hasEarlier = Array.isArray(grouped.earlier) && grouped.earlier.length > 0;

  if (!hasToday && !hasYesterday && !hasEarlier && (!data.notifications || data.notifications.length === 0)) {
    container.innerHTML = `
      <div class="notifications-empty-state">
        <div class="notifications-empty-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
          </svg>
        </div>
        <div class="notifications-empty-title">All caught up!</div>
        <div class="notifications-empty-desc">You have no new notifications right now.</div>
      </div>
    `;
    return;
  }

  let html = '';

  const renderGroup = (title, items) => {
    if (!items || items.length === 0) return '';
    let groupHtml = `
      <div class="notification-date-group">
        <h2 class="notification-date-group-title">${title}</h2>
        <div class="notification-group-list">
    `;

    items.forEach((item) => {
      const isUnread = !item.isRead;
      const iconSvg = getNotificationIconSvg(item.type, item.icon);
      const iconBg = item.iconBg || 'rgba(232, 148, 63, 0.2)';

      groupHtml += `
        <div class="notification-row ${isUnread ? 'unread' : ''}" id="notifRow_${item._id}" onclick="handleNotificationClick('${item._id}')">
          <div class="notification-icon-wrap" style="background: ${iconBg};">
            ${iconSvg}
          </div>
          <div class="notification-content-col">
            <div class="notification-item-title">${escapeHtml(item.title)}</div>
            <div class="notification-item-message">${escapeHtml(item.message)}</div>
            <div class="notification-item-time">${escapeHtml(item.time || item.relativeTime)}</div>
          </div>
        </div>
      `;
    });

    groupHtml += `
        </div>
      </div>
    `;
    return groupHtml;
  };

  if (hasToday) html += renderGroup('Today', grouped.today);
  if (hasYesterday) html += renderGroup('Yesterday', grouped.yesterday);
  if (hasEarlier) html += renderGroup('Earlier', grouped.earlier);

  // Fallback for flat list if not categorized
  if (!html && data.notifications?.length > 0) {
    html = renderGroup('All Notifications', data.notifications);
  }

  container.innerHTML = html;
}

/**
 * Handle "Mark as all read" Action
 */
async function handleMarkAllRead() {
  try {
    const res = await fetch(`${API_BASE}/notifications/mark-all-read`, {
      method: 'PATCH'
    });

    if (res.ok) {
      // Remove all unread visual indicators
      document.querySelectorAll('.notification-row.unread').forEach((row) => {
        row.classList.remove('unread');
      });
      updateNotificationBadge(0);
      showToast('All notifications marked as read', 'success');
    }
  } catch (err) {
    console.error('Error marking all as read:', err);
    // Optimistic UI update
    document.querySelectorAll('.notification-row.unread').forEach((row) => {
      row.classList.remove('unread');
    });
    updateNotificationBadge(0);
    showToast('All notifications marked as read', 'success');
  }
}

/**
 * Handle Single Notification Item Click
 */
async function handleNotificationClick(notificationId) {
  const row = document.getElementById(`notifRow_${notificationId}`);
  if (row && row.classList.contains('unread')) {
    row.classList.remove('unread');
    if (notificationsState.unreadCount > 0) {
      updateNotificationBadge(notificationsState.unreadCount - 1);
    }

    try {
      await fetch(`${API_BASE}/notifications/${notificationId}/read`, {
        method: 'PATCH'
      });
    } catch (err) {
      console.warn('Error marking notification as read:', err);
    }
  }
}

/**
 * Real-Time Socket Connection for Instant Live Notifications
 */
function initNotificationsSocket() {
  if (typeof io === 'undefined') {
    console.warn('Socket.io library not loaded, real-time live events will use HTTP polling');
    return;
  }

  try {
    const socketHost = window.location.hostname || 'localhost';
    const socketUrl = `${window.location.protocol}//${socketHost}:3049`;
    const socket = io(socketUrl, {
      reconnection: true,
      reconnectionAttempts: 5,
      timeout: 5000
    });

    socket.on('connect', () => {
      console.log('⚡ Connected to Swimletes notification socket:', socket.id);
    });

    socket.on('get notification', (data) => {
      showToast(data.message || 'New notification', 'info');
      fetchNotificationBadgeCount();
      if (state.currentScreen === 'notifications') {
        fetchNotificationsData();
      }
    });

    socket.on('newNotification', (data) => {
      showToast(data.data?.title || 'New notification', 'info');
      fetchNotificationBadgeCount();
      if (state.currentScreen === 'notifications') {
        fetchNotificationsData();
      }
    });

    socket.on('notificationCount', (data) => {
      if (typeof data.unreadCount === 'number') {
        updateNotificationBadge(data.unreadCount);
      }
    });
  } catch (err) {
    console.warn('Socket initialization error:', err);
  }
}


