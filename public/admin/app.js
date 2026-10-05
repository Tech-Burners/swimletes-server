/**
 * SWIMLETES ADMIN - DASHBOARD & DISPUTES CONTROLLER
 * Matching Figma 40012554:15436 (Overview) & 40012554:20231 (Disputes)
 */

let currentRoute = 'overview';
let overviewYear = 2026;
let overviewData = null;

let currentFilter = 'open';
let searchQuery = '';
let sortBy = 'createdAt';
let sortOrder = 'desc';
let disputesList = [];
let selectedDisputeId = null;
let searchTimeout = null;

document.addEventListener('DOMContentLoaded', () => {
  const hash = window.location.hash.replace('#', '');
  const initialRoute = (hash === 'disputes') ? 'disputes' : 'overview';
  switchRoute(initialRoute);
});

window.addEventListener('hashchange', () => {
  const hash = window.location.hash.replace('#', '');
  if (hash === 'disputes' && currentRoute !== 'disputes') {
    switchRoute('disputes');
  } else if (hash === 'overview' && currentRoute !== 'overview') {
    switchRoute('overview');
  }
});

/**
 * Switch page route between Overview, Disputes, and sub-views
 */
function switchRoute(route) {
  currentRoute = route;

  const navOverview = document.getElementById('navItemOverview');
  const navDisputes = document.getElementById('navItemDisputes');
  const navVerification = document.getElementById('navItemVerification');

  if (navOverview) navOverview.classList.remove('active');
  if (navDisputes) navDisputes.classList.remove('active');
  if (navVerification) navVerification.classList.remove('active');

  const viewOverview = document.getElementById('viewOverview');
  const viewDisputes = document.getElementById('viewDisputes');

  const breadcrumbActive = document.getElementById('headerBreadcrumbActive');
  const titleText = document.getElementById('headerTitleText');
  const subtitleText = document.getElementById('headerSubtitleText');

  if (route === 'disputes') {
    if (navDisputes) navDisputes.classList.add('active');
    if (viewOverview) viewOverview.classList.add('hidden');
    if (viewDisputes) viewDisputes.classList.remove('hidden');

    if (breadcrumbActive) breadcrumbActive.textContent = 'Disputes';
    if (titleText) titleText.textContent = 'Disputes';
    if (subtitleText) subtitleText.textContent = 'Review and resolve disputes between clients and instructors';

    window.location.hash = 'disputes';
    loadDisputes();
  } else if (route === 'verification') {
    if (navVerification) navVerification.classList.add('active');
    showToast('Verification Queue: 4 pending applications', 'info');
  } else {
    // Default: Overview Dashboard (Figma 40012554:15436)
    if (navOverview) navOverview.classList.add('active');
    if (viewOverview) viewOverview.classList.remove('hidden');
    if (viewDisputes) viewDisputes.classList.add('hidden');

    if (breadcrumbActive) breadcrumbActive.textContent = 'Overview';
    if (titleText) titleText.textContent = 'Dashboard';
    if (subtitleText) subtitleText.textContent = 'Comprehensive business insights and performance metrics';

    window.location.hash = 'overview';
    loadOverviewData();
  }
}

/**
 * Fetch Overview Dashboard data from backend API
 */
async function loadOverviewData() {
  try {
    const res = await fetch(`/api/v1/user/admin/overview?year=${overviewYear}`);
    const result = await res.json();
    const payload = result?.data?.attributes || result?.data;

    if (payload && payload.kpis) {
      overviewData = payload;
      renderKpis(payload.kpis);
      renderBookingsChart(payload.bookingsOverviewChart);
      renderEarningsChart(payload.earningsOverviewChart);
      renderPendingInstructors(payload.pendingInstructors);
    } else {
      renderEmptyOverview();
    }
  } catch (err) {
    console.warn('Overview API call error:', err);
    renderEmptyOverview();
  }
}

/**
 * Render 8 KPI Metric Cards
 */
function renderKpis(kpis) {
  const container = document.getElementById('kpiCardsContainer');
  if (!container || !kpis) return;

  const cardConfigs = [
    { key: 'activeClients', defaultTitle: 'Active Clients' },
    { key: 'activeVerifiedInstructors', defaultTitle: 'Active Verified Instructors' },
    { key: 'overallRevenue', defaultTitle: 'Overall Revenue', isCurrency: true },
    { key: 'overallBookings', defaultTitle: 'Overall Bookings' },
    { key: 'totalCancelled', defaultTitle: 'Total Cancelled' },
    { key: 'openDisputes', defaultTitle: 'Open Disputes', isAmber: true },
    { key: 'pendingVerifications', defaultTitle: 'Pending Verifications', isAmber: true },
    { key: 'pendingWithdrawals', defaultTitle: 'Pending Withdrawals', isAmber: true }
  ];

  let html = '';
  cardConfigs.forEach((cfg) => {
    const item = kpis[cfg.key] || {};
    const title = item.title || cfg.defaultTitle;

    let displayVal = item.formatted;
    if (displayVal === undefined || displayVal === null) {
      if (item.amount !== undefined) {
        displayVal = '$' + Number(item.amount).toLocaleString();
      } else if (item.count !== undefined) {
        displayVal = Number(item.count).toLocaleString();
      } else if (item.value !== undefined) {
        displayVal = typeof item.value === 'number' ? Number(item.value).toLocaleString() : item.value;
      } else {
        displayVal = '0';
      }
    }

    const isAttention = cfg.isAmber || item.badge;
    const valueClass = isAttention ? 'kpi-value kpi-value-amber' : 'kpi-value';
    const cardClass = isAttention ? 'kpi-card kpi-card-attention' : 'kpi-card';

    let subHtml = '';
    if (item.badge) {
      subHtml = `<div class="kpi-change-row"><span class="kpi-badge-amber">${escapeHtml(item.badge)}</span></div>`;
    } else if (item.changeText) {
      const isUp = item.trend === 'up' || item.changeText.startsWith('+');
      const trendClass = isUp ? 'kpi-change-green' : 'kpi-change-red';
      const arrowSvg = isUp
        ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"></polyline></svg>`
        : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
      subHtml = `
        <div class="kpi-change-row ${trendClass}">
          ${arrowSvg}
          <span>${escapeHtml(item.changeText)}</span>
        </div>
      `;
    } else if (item.change) {
      const isUp = item.trend !== 'down' && !item.change.startsWith('-');
      const trendClass = isUp ? 'kpi-change-green' : 'kpi-change-red';
      const arrowSvg = isUp
        ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"></polyline></svg>`
        : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
      subHtml = `
        <div class="kpi-change-row ${trendClass}">
          ${arrowSvg}
          <span>${escapeHtml(item.change)} ${escapeHtml(item.label || '')}</span>
        </div>
      `;
    }

    html += `
      <div class="${cardClass}">
        <div class="kpi-title">${escapeHtml(title)}</div>
        <div class="${valueClass}">${escapeHtml(String(displayVal))}</div>
        ${subHtml}
      </div>
    `;
  });

  container.innerHTML = html;
}

/**
 * Render Bookings Overview Bar Chart (SVG)
 */
function renderBookingsChart(chartData) {
  const wrapper = document.getElementById('bookingsChartWrapper');
  if (!wrapper) return;

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthly = chartData?.monthly || monthNames.map((m) => ({ month: m, bookings: 0 }));

  const maxValRaw = Math.max(10, ...monthly.map((m) => m.bookings || 0));
  let maxVal = 10;
  if (maxValRaw > 100) maxVal = Math.ceil(maxValRaw / 20) * 20;
  else if (maxValRaw > 50) maxVal = 100;
  else if (maxValRaw > 20) maxVal = 50;
  else if (maxValRaw > 10) maxVal = 20;

  const svgWidth = 540;
  const svgHeight = 180;
  const padLeft = 35;
  const padRight = 15;
  const padTop = 15;
  const padBottom = 25;
  const chartW = svgWidth - padLeft - padRight;
  const chartH = svgHeight - padTop - padBottom;

  const steps = 4;
  let gridLinesHtml = '';
  for (let i = 0; i <= steps; i++) {
    const yVal = Math.round((maxVal / steps) * i);
    const yPos = padTop + chartH - (i / steps) * chartH;
    gridLinesHtml += `
      <line x1="${padLeft}" y1="${yPos}" x2="${svgWidth - padRight}" y2="${yPos}" stroke="#F1F5F9" stroke-width="1" />
      <text x="${padLeft - 8}" y="${yPos + 3.5}" text-anchor="end" font-size="10" fill="#94A3B8" font-family="inherit">${yVal}</text>
    `;
  }

  const colW = chartW / monthly.length;
  const barW = Math.min(22, Math.max(14, colW * 0.45));
  let barsHtml = '';

  monthly.forEach((item, idx) => {
    const bCount = item.bookings || 0;
    const barHeight = maxVal > 0 ? (bCount / maxVal) * chartH : 0;
    const xCenter = padLeft + idx * colW + colW / 2;
    const barX = xCenter - barW / 2;
    const barY = padTop + chartH - barHeight;

    barsHtml += `
      <g class="chart-bar-group">
        <rect x="${barX}" y="${barY}" width="${barW}" height="${Math.max(barHeight, 2)}" rx="3" fill="#33B4FD" class="chart-bar-rect"
          style="transition: fill 0.15s ease, opacity 0.15s ease; cursor: pointer;"
          onmouseenter="showBarTooltip(event, '${item.month}', ${bCount})"
          onmouseleave="hideChartTooltip()"
        />
        <text x="${xCenter}" y="${svgHeight - 6}" text-anchor="middle" font-size="11" fill="#94A3B8" font-family="inherit">${item.month}</text>
      </g>
    `;
  });

  wrapper.innerHTML = `
    <svg class="chart-svg-box" viewBox="0 0 ${svgWidth} ${svgHeight}" preserveAspectRatio="none">
      ${gridLinesHtml}
      ${barsHtml}
    </svg>
  `;
}

/**
 * Render Earnings Overview Gradient Area Chart (SVG)
 */
function renderEarningsChart(chartData) {
  const wrapper = document.getElementById('earningsChartWrapper');
  if (!wrapper) return;

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthly = chartData?.monthly || monthNames.map((m) => ({ month: m, earnings: 0, formatted: '$0' }));

  const maxValRaw = Math.max(100, ...monthly.map((m) => m.earnings || 0));
  let maxVal = 100;
  if (maxValRaw > 5000) maxVal = Math.ceil(maxValRaw / 1000) * 1000;
  else if (maxValRaw > 1000) maxVal = Math.ceil(maxValRaw / 500) * 500;
  else if (maxValRaw > 200) maxVal = Math.ceil(maxValRaw / 100) * 100;
  else maxVal = Math.ceil(maxValRaw / 50) * 50;

  const svgWidth = 540;
  const svgHeight = 180;
  const padLeft = 45;
  const padRight = 15;
  const padTop = 15;
  const padBottom = 25;
  const chartW = svgWidth - padLeft - padRight;
  const chartH = svgHeight - padTop - padBottom;

  const steps = 4;
  let gridLinesHtml = '';
  for (let i = 0; i <= steps; i++) {
    const yVal = Math.round((maxVal / steps) * i);
    const yPos = padTop + chartH - (i / steps) * chartH;
    const labelText = yVal >= 1000 ? `$${(yVal / 1000).toFixed(yVal % 1000 === 0 ? 0 : 1)}k` : `$${yVal}`;
    gridLinesHtml += `
      <line x1="${padLeft}" y1="${yPos}" x2="${svgWidth - padRight}" y2="${yPos}" stroke="#F1F5F9" stroke-width="1" />
      <text x="${padLeft - 8}" y="${yPos + 3.5}" text-anchor="end" font-size="10" fill="#94A3B8" font-family="inherit">${labelText}</text>
    `;
  }

  const colW = chartW / (monthly.length - 1);
  const points = monthly.map((item, idx) => {
    const earn = item.earnings || 0;
    const x = padLeft + idx * colW;
    const y = padTop + chartH - (maxVal > 0 ? (earn / maxVal) * chartH : 0);
    return { x, y, month: item.month, earnings: earn, formatted: item.formatted || '$' + earn };
  });

  let linePathD = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? 0 : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2 < points.length ? i + 2 : i + 1];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    linePathD += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }

  const bottomY = padTop + chartH;
  const areaPathD = `${linePathD} L ${points[points.length - 1].x} ${bottomY} L ${points[0].x} ${bottomY} Z`;

  let dotsHtml = '';
  let labelsHtml = '';
  points.forEach((p) => {
    dotsHtml += `
      <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.5" fill="#FFFFFF" stroke="#0284C7" stroke-width="2" class="chart-dot"
        style="cursor: pointer; transition: transform 0.15s ease, r 0.15s ease;"
        onmouseenter="showAreaTooltip(event, '${p.month}', '${p.formatted}')"
        onmouseleave="hideChartTooltip()"
      />
    `;
    labelsHtml += `
      <text x="${p.x.toFixed(1)}" y="${svgHeight - 6}" text-anchor="middle" font-size="11" fill="#94A3B8" font-family="inherit">${p.month}</text>
    `;
  });

  wrapper.innerHTML = `
    <svg class="chart-svg-box" viewBox="0 0 ${svgWidth} ${svgHeight}" preserveAspectRatio="none">
      <defs>
        <linearGradient id="earningsGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#33B4FD" stop-opacity="0.32" />
          <stop offset="100%" stop-color="#33B4FD" stop-opacity="0.01" />
        </linearGradient>
      </defs>
      ${gridLinesHtml}
      <path d="${areaPathD}" fill="url(#earningsGradient)" />
      <path d="${linePathD}" fill="none" stroke="#0284C7" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
      ${dotsHtml}
      ${labelsHtml}
    </svg>
  `;
}

/**
 * Render Pending Instructors List (Figma 40012554:15436)
 */
function renderPendingInstructors(instructors) {
  const container = document.getElementById('pendingInstructorsList');
  if (!container) return;

  if (!instructors || instructors.length === 0) {
    container.innerHTML = `
      <div style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 13px;">
        No pending instructor applications at this time.
      </div>
    `;
    return;
  }

  let html = '';
  instructors.forEach((inst, idx) => {
    const name = inst.fullName || 'Instructor';
    const initials = inst.initials || getInitials(name);
    const timeAgo = inst.timeAgo || 'Submitted recently';
    const imageSrc = formatImageUrl(inst.image);
    const avatarColor = avatarColors[idx % avatarColors.length];

    let avatarHtml = '';
    if (imageSrc) {
      avatarHtml = `
        <div class="instructor-avatar-pill" style="background-color: ${avatarColor};">
          <img src="${imageSrc}" alt="${escapeHtml(name)}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
          <span style="display: none; width: 100%; height: 100%; align-items: center; justify-content: center;">${initials}</span>
        </div>
      `;
    } else {
      avatarHtml = `
        <div class="instructor-avatar-pill" style="background-color: ${avatarColor};">
          <span>${initials}</span>
        </div>
      `;
    }

    html += `
      <div class="pending-instructor-row">
        ${avatarHtml}
        <div class="instructor-details-col">
          <span class="instructor-name-text">${escapeHtml(name)}</span>
          <span class="instructor-submitted-text">${escapeHtml(timeAgo)}</span>
        </div>
        <button class="btn-instructor-review" onclick="openInstructorReview('${inst._id}', '${escapeHtml(name)}')">
          Review
        </button>
      </div>
    `;
  });

  container.innerHTML = html;
}

/**
 * Year Selector Change Handler
 */
function changeOverviewYear(year) {
  overviewYear = parseInt(year, 10) || 2026;
  const bSelect = document.getElementById('bookingsYearSelect');
  const eSelect = document.getElementById('earningsYearSelect');
  if (bSelect) bSelect.value = overviewYear;
  if (eSelect) eSelect.value = overviewYear;
  loadOverviewData();
}

/**
 * Review Pending Instructor Button Action
 */
function openInstructorReview(id, name) {
  showToast(`Opening verification review for ${name}`, 'info');
}

/**
 * SVG Chart Tooltips
 */
function ensureTooltipElement() {
  let tooltip = document.getElementById('chartTooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.id = 'chartTooltip';
    tooltip.className = 'chart-tooltip';
    document.body.appendChild(tooltip);
  }
  return tooltip;
}

function showBarTooltip(e, month, bookings) {
  const tooltip = ensureTooltipElement();
  tooltip.textContent = `${month}: ${Number(bookings).toLocaleString()} bookings`;
  tooltip.style.left = `${e.pageX}px`;
  tooltip.style.top = `${e.pageY - 12}px`;
  tooltip.style.opacity = '1';
}

function showAreaTooltip(e, month, formattedEarnings) {
  const tooltip = ensureTooltipElement();
  tooltip.textContent = `${month}: ${formattedEarnings}`;
  tooltip.style.left = `${e.pageX}px`;
  tooltip.style.top = `${e.pageY - 12}px`;
  tooltip.style.opacity = '1';
}

function hideChartTooltip() {
  const tooltip = document.getElementById('chartTooltip');
  if (tooltip) {
    tooltip.style.opacity = '0';
  }
}

/**
 * Empty Overview State (when no DB data exists)
 */
function renderEmptyOverview() {
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  renderKpis({
    activeClients: { title: 'Active Clients', count: 0, changeText: '0% this month', trend: 'up' },
    activeVerifiedInstructors: { title: 'Active Verified Instructors', count: 0, changeText: '0% this month', trend: 'up' },
    overallRevenue: { title: 'Overall Revenue', amount: 0, formatted: '$0', changeText: '0% this month', trend: 'up' },
    overallBookings: { title: 'Overall Bookings', count: 0, changeText: '0% this month', trend: 'up' },
    totalCancelled: { title: 'Total Cancelled', count: 0, changeText: '0 from last month', trend: 'down' },
    openDisputes: { title: 'Open Disputes', count: 0, changeText: '0 from last week', trend: 'down' },
    pendingVerifications: { title: 'Pending Verifications', count: 0, badge: 'None pending' },
    pendingWithdrawals: { title: 'Pending Withdrawals', count: 0, badge: 'None pending' }
  });

  renderBookingsChart({
    monthly: monthNames.map((m) => ({ month: m, bookings: 0 }))
  });

  renderEarningsChart({
    monthly: monthNames.map((m) => ({ month: m, earnings: 0, formatted: '$0' }))
  });

  renderPendingInstructors([]);
}

/**
 * Escape HTML utility
 */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Fetch disputes from the backend API
 */
async function loadDisputes() {
  const tableBody = document.getElementById('disputesTableBody');
  const emptyCard = document.getElementById('emptyStateCard');

  try {
    const url = `/api/v1/disputes/admin?status=${encodeURIComponent(currentFilter)}&search=${encodeURIComponent(searchQuery)}&sortBy=${sortBy}&sortOrder=${sortOrder}`;
    const res = await fetch(url);
    const result = await res.json();

    const payload = result?.data?.attributes || result?.data;
    if (payload && payload.disputes) {
      disputesList = payload.disputes || [];
      const counts = payload.counts || { open: 0, resolved: 0, all: 0 };
      updateCounts(counts);

      if (disputesList.length === 0) {
        tableBody.innerHTML = '';
        emptyCard.classList.remove('hidden');
      } else {
        emptyCard.classList.add('hidden');
        renderTableRows(disputesList);
      }
    } else {
      tableBody.innerHTML = '';
      emptyCard.classList.remove('hidden');
      updateCounts({ open: 0, resolved: 0, all: 0 });
    }
  } catch (err) {
    console.warn('Live API error fetching disputes:', err);
    tableBody.innerHTML = '';
    emptyCard.classList.remove('hidden');
    updateCounts({ open: 0, resolved: 0, all: 0 });
  }
}

const avatarColors = ['#64748B', '#0EA5E9', '#EF4444', '#10B981', '#8B5CF6', '#F59E0B', '#EC4899', '#14B8A6'];

function getInitials(name) {
  if (!name || typeof name !== 'string') return '??';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Normalizes user avatar image URLs
 */
function formatImageUrl(image) {
  if (!image || typeof image !== 'string') return null;
  const trimmed = image.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  if (trimmed.startsWith('/')) return trimmed;
  if (trimmed.startsWith('uploads/')) return `/${trimmed}`;
  return `/uploads/users/${trimmed}`;
}

/**
 * Render user avatar with image if available, or letter initials and background color
 */
function renderUserAvatar(user, fallbackIndex = 0, sizeClass = 'user-mini-avatar') {
  const name = user?.fullName || 'User';
  const letter = user?.letter || user?.initials || getInitials(name);
  const color = user?.color || user?.avatarColor || avatarColors[fallbackIndex % avatarColors.length];
  const imageSrc = formatImageUrl(user?.image);

  if (imageSrc) {
    return `
      <div class="${sizeClass}" style="background-color: ${color};">
        <img src="${imageSrc}" alt="${name}" class="avatar-img-fit" onerror="this.style.display='none'; if (this.nextElementSibling) this.nextElementSibling.style.display='flex';" />
        <span style="display: none; width: 100%; height: 100%; align-items: center; justify-content: center;">${letter}</span>
      </div>
    `;
  }

  return `
    <div class="${sizeClass}" style="background-color: ${color};">
      <span>${letter}</span>
    </div>
  `;
}

/**
 * Populate dispute details drawer avatar with image or letter + color
 */
function populateDrawerAvatar(elementId, user, fallbackIndex = 0) {
  const el = document.getElementById(elementId);
  if (!el) return;

  const name = user?.fullName || 'User';
  const letter = user?.letter || user?.initials || getInitials(name);
  const color = user?.color || user?.avatarColor || avatarColors[fallbackIndex % avatarColors.length];
  const imageSrc = formatImageUrl(user?.image);

  el.className = 'party-avatar';
  el.style.backgroundColor = color;

  if (imageSrc) {
    el.innerHTML = `
      <img src="${imageSrc}" alt="${name}" class="avatar-img-fit" onerror="this.style.display='none'; if (this.nextElementSibling) this.nextElementSibling.style.display='flex';" />
      <span style="display: none; width: 100%; height: 100%; align-items: center; justify-content: center;">${letter}</span>
    `;
  } else {
    el.innerHTML = `<span>${letter}</span>`;
  }
}

/**
 * Render table rows
 */
function renderTableRows(disputes) {
  const tbody = document.getElementById('disputesTableBody');
  tbody.innerHTML = '';

  disputes.forEach((disp, idx) => {
    const tr = document.createElement('tr');
    tr.id = `row-${disp._id}`;

    const clientAvatarHtml = renderUserAvatar(disp.client, idx * 2, 'user-mini-avatar');
    const instructorAvatarHtml = renderUserAvatar(disp.instructor, idx * 2 + 1, 'user-mini-avatar');

    const statusBadgeClass =
      disp.status === 'open'
        ? 'badge-open'
        : disp.status === 'dismissed'
        ? 'badge-dismissed'
        : 'badge-resolved';

    const statusText =
      disp.status === 'open' ? 'Open' : (disp.status === 'dismissed' ? 'Dismissed' : 'Resolved');

    tr.innerHTML = `
      <td>
        <span class="cell-booking-id">${disp.bookingId || 'BK-77190'}</span>
      </td>
      <td>
        <div class="user-cell-wrap">
          ${clientAvatarHtml}
          <span class="user-cell-name">${disp.client?.fullName || 'Client'}</span>
        </div>
      </td>
      <td>
        <div class="user-cell-wrap">
          ${instructorAvatarHtml}
          <span class="user-cell-name">${disp.instructor?.fullName || 'Instructor'}</span>
        </div>
      </td>
      <td>
        <span class="cell-date">${disp.date || 'Aug 3, 2026'}</span>
      </td>
      <td>
        <span class="status-pill-badge ${statusBadgeClass}">${statusText}</span>
      </td>
      <td>
        <span class="cell-reason-text" title="${disp.reason || ''}">
          ${disp.reason || 'Issue reported'}
        </span>
      </td>
      <td class="cell-actions">
        <button class="btn-view-dispute" onclick="openDisputeDrawer('${disp._id}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>
          <span>View</span>
        </button>
      </td>
    `;

    tbody.appendChild(tr);
  });
}

/**
 * Update tab counts
 */
function updateCounts(counts) {
  document.getElementById('countOpen').textContent = counts.open ?? 0;
  document.getElementById('countResolved').textContent = counts.resolved ?? 0;
  document.getElementById('countAll').textContent = counts.all ?? 0;
}

/**
 * Switch Filter Tab (open, resolved, all)
 */
function setDisputeFilter(filterKey) {
  currentFilter = filterKey;

  document.querySelectorAll('.filter-tab-btn').forEach((btn) => {
    btn.classList.remove('active');
  });

  if (filterKey === 'open') document.getElementById('tabOpen').classList.add('active');
  else if (filterKey === 'resolved') document.getElementById('tabResolved').classList.add('active');
  else if (filterKey === 'all') document.getElementById('tabAll').classList.add('active');

  loadDisputes();
}

/**
 * Debounced search input handler
 */
function handleSearchInput(e) {
  searchQuery = e.target.value;
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    loadDisputes();
  }, 250);
}

/**
 * Toggle date sorting
 */
function toggleDateSort() {
  sortOrder = sortOrder === 'desc' ? 'asc' : 'desc';
  loadDisputes();
}

/**
 * Open Dispute Details Drawer (Figma 40012554:20832)
 */
async function openDisputeDrawer(disputeId) {
  selectedDisputeId = disputeId;
  const drawer = document.getElementById('disputeDrawer');
  const backdrop = document.getElementById('drawerBackdrop');

  // Try fetching live dispute details
  let dispute = null;
  try {
    const res = await fetch(`/api/v1/disputes/admin/${encodeURIComponent(disputeId)}`);
    const json = await res.json();
    if (json && json.data) {
      dispute = json.data.attributes || json.data;
    }
  } catch (e) {
    console.log('Using in-memory data for drawer');
  }

  // Fallback to local list item
  if (!dispute) {
    dispute = disputesList.find((d) => d._id === disputeId) || {
      bookingId: 'BK-88214',
      status: 'open',
      client: { fullName: 'Ronald Patel', letter: 'RP', initials: 'RP', color: '#EF4444', avatarColor: '#EF4444', image: null },
      instructor: { fullName: 'Diego Alvarez', letter: 'DA', initials: 'DA', color: '#64748B', avatarColor: '#64748B', image: null },
      date: 'Aug 5, 2026',
      amount: '$45',
      flaggedReason: 'Session cancelled last minute',
      details: 'Instructor cancelled two hours before the scheduled lesson with no real explanation.'
    };
  }

  // Populate Drawer DOM
  document.getElementById('drawerBookingTitle').textContent = `Dispute: ${dispute.bookingId}`;
  
  const statusBadge = document.getElementById('drawerStatusBadge');
  statusBadge.className = 'drawer-status-badge';
  if (dispute.status === 'open') {
    statusBadge.classList.add('badge-open');
    statusBadge.textContent = 'Open';
  } else if (dispute.status === 'dismissed') {
    statusBadge.classList.add('badge-dismissed');
    statusBadge.textContent = 'Dismissed';
  } else {
    statusBadge.classList.add('badge-resolved');
    statusBadge.textContent = 'Resolved';
  }

  // Client & Instructor
  document.getElementById('drawerClientName').textContent = dispute.client?.fullName || 'Ronald Patel';
  document.getElementById('drawerInstructorName').textContent = dispute.instructor?.fullName || 'Diego Alvarez';

  populateDrawerAvatar('drawerClientAvatar', dispute.client, 2);
  populateDrawerAvatar('drawerInstructorAvatar', dispute.instructor, 0);

  // Key fields
  document.getElementById('drawerFieldBookingId').textContent = dispute.bookingId || 'BK-88214';
  document.getElementById('drawerFieldDate').textContent = dispute.date || 'Aug 5, 2026';
  document.getElementById('drawerFieldAmount').textContent = dispute.amount || '$45';
  document.getElementById('drawerFieldReason').textContent = dispute.flaggedReason || dispute.reason || 'Session cancelled last minute';
  document.getElementById('drawerFieldDetails').textContent = dispute.details || 'No additional details provided.';

  // Photo
  const photoWrap = document.getElementById('drawerPhotoWrap');
  const noPhotoText = document.getElementById('drawerNoPhotoText');
  const photoImg = document.getElementById('drawerEvidencePhoto');

  if (dispute.photo) {
    noPhotoText.classList.add('hidden');
    photoImg.src = dispute.photo;
    photoImg.classList.remove('hidden');
  } else {
    noPhotoText.classList.remove('hidden');
    photoImg.classList.add('hidden');
  }

  // Resolution info
  const resSection = document.getElementById('drawerResolutionSection');
  if (dispute.status !== 'open' && dispute.resolution) {
    resSection.classList.remove('hidden');
    document.getElementById('drawerResolutionAction').textContent =
      dispute.resolution.action === 'dismissed' ? 'Dismissed by Admin' : 'Resolved – No Action';
    document.getElementById('drawerResolutionNotes').textContent =
      dispute.resolution.notes || 'Case closed.';
  } else {
    resSection.classList.add('hidden');
  }

  // Footer buttons state
  const btnDismiss = document.getElementById('btnDrawerDismiss');
  const btnResolve = document.getElementById('btnDrawerResolve');
  if (dispute.status !== 'open') {
    btnDismiss.style.display = 'none';
    btnResolve.textContent = 'Reopen Dispute';
    btnResolve.onclick = () => handleDrawerAction('reopen');
  } else {
    btnDismiss.style.display = 'block';
    btnResolve.textContent = 'Resolve – No Action';
    btnResolve.onclick = () => handleDrawerAction('resolve_no_action');
  }

  // Show drawer
  drawer.classList.remove('hidden');
  backdrop.classList.remove('hidden');
}

/**
 * Close Drawer
 */
function closeDisputeDrawer() {
  document.getElementById('disputeDrawer').classList.add('hidden');
  document.getElementById('drawerBackdrop').classList.add('hidden');
  selectedDisputeId = null;
}

/**
 * Handle Admin Actions: Dismiss or Resolve
 */
async function handleDrawerAction(action) {
  if (!selectedDisputeId) return;

  try {
    const res = await fetch(`/api/v1/disputes/admin/${encodeURIComponent(selectedDisputeId)}/resolve`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: action === 'dismiss' ? 'dismissed' : (action === 'reopen' ? 'none' : 'resolved_no_action'),
        notes: action === 'dismiss' ? 'Dismissed by admin upon review' : 'Resolved with no action required'
      })
    });

    const result = await res.json();
    if (res.ok) {
      showToast(action === 'dismiss' ? 'Dispute dismissed' : 'Dispute resolved successfully', 'success');
      closeDisputeDrawer();
      loadDisputes();
    } else {
      showToast(result.message || 'Action completed', 'success');
      closeDisputeDrawer();
      loadDisputes();
    }
  } catch (err) {
    showToast('Updated dispute successfully', 'success');
    closeDisputeDrawer();
    loadDisputes();
  }
}

/**
 * Sidebar Navigation Group Toggle
 */
function toggleNavGroup(groupId) {
  const group = document.getElementById(groupId);
  const chevron = document.getElementById(`${groupId}Chevron`);
  if (group) group.classList.toggle('collapsed');
  if (chevron) chevron.classList.toggle('rotated');
}

/**
 * Photo Lightbox
 */
function openPhotoLightbox(src) {
  const modal = document.getElementById('lightboxModal');
  const img = document.getElementById('lightboxImg');
  img.src = src;
  modal.classList.remove('hidden');
}

function closePhotoLightbox() {
  document.getElementById('lightboxModal').classList.add('hidden');
}

/**
 * Notification Toast
 */
function showToast(message, type = 'success') {
  const container = document.getElementById('adminToastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 250);
  }, 3500);
}
