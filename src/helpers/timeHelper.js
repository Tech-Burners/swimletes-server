const ApiError = require('./ApiError');
const { status: httpStatus } = require('http-status');

/**
 * Convert time string (e.g. "09:00 AM", "1:30 PM", "14:00") to integer minutes from midnight
 * @param {string} timeStr
 * @returns {number|null} minutes from midnight (0 - 1439) or null if invalid
 */
const timeStringToMinutes = (timeStr) => {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return null;

  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const modifier = match[3] ? match[3].toUpperCase() : null;

  if (isNaN(hours) || isNaN(minutes) || minutes < 0 || minutes >= 60) return null;

  if (modifier === 'PM' && hours < 12) hours += 12;
  if (modifier === 'AM' && hours === 12) hours = 0;

  if (hours < 0 || hours >= 24) return null;

  return hours * 60 + minutes;
};

/**
 * Convert integer minutes from midnight into 12-hour formatted time string (e.g. 600 -> "10:00 AM")
 * @param {number} totalMinutes
 * @returns {string} e.g. "10:00 AM"
 */
const minutesToTimeString = (totalMinutes) => {
  if (typeof totalMinutes !== 'number' || isNaN(totalMinutes)) return '';
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  const modifier = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 === 0 ? 12 : hours % 12;
  const displayHoursStr = String(displayHours).padStart(2, '0');
  const displayMinutesStr = String(minutes).padStart(2, '0');
  return `${displayHoursStr}:${displayMinutesStr} ${modifier}`;
};

/**
 * Resolve end time string, computing from duration if not explicitly provided
 * @param {string} startTime e.g. "10:00 AM"
 * @param {string|null} endTime e.g. "11:00 AM"
 * @param {number} duration in minutes (default 60)
/**
 * Resolve end time string, computing from duration if not explicitly provided
 * @param {string} startTime e.g. "10:00 AM"
 * @param {string|null} endTime e.g. "11:00 AM"
 * @param {number} duration in minutes (default 60)
 * @returns {string}
 */
const resolveEndTime = (startTime, endTime = null, duration = 60) => {
  const startMin = timeStringToMinutes(startTime);
  const dur = typeof duration === 'number' && duration > 0 ? duration : 60;

  if (endTime && typeof endTime === 'string' && endTime.trim()) {
    const trimmed = endTime.trim();
    const endMin = timeStringToMinutes(trimmed);

    if (startMin !== null && endMin !== null) {
      // Fix common typo: 12:00 AM entered instead of 12:00 PM for morning/daytime starts
      if (endMin === 0 && startMin >= 360 && startMin <= 720) {
        return '12:00 PM';
      }
      // If end time is strictly after start time, use it
      if (endMin > startMin) {
        return trimmed;
      }
    }
  }

  if (startMin === null) return endTime || '';
  return minutesToTimeString(startMin + dur);
};

/**
 * Check if two time intervals [startA, endA) and [startB, endB) overlap (collapse)
 * @param {string} startA
 * @param {string} endA
 * @param {string} startB
 * @param {string} endB
 * @returns {boolean} true if time intervals collide/overlap
 */
const isTimeOverlapping = (startA, endA, startB, endB) => {
  // 1. Same start time means they collide immediately
  if (startA && startB && startA.trim().toLowerCase() === startB.trim().toLowerCase()) {
    return true;
  }

  const sA = timeStringToMinutes(startA);
  let eA = timeStringToMinutes(endA);
  const sB = timeStringToMinutes(startB);
  let eB = timeStringToMinutes(endB);

  // 2. Exact same start minute
  if (sA !== null && sB !== null && sA === sB) {
    return true;
  }

  if (sA !== null && eA !== null && sB !== null && eB !== null) {
    // If end is <= start, normalize (12:00 AM noon typo or midnight/next-day)
    if (eA <= sA) {
      if (eA === 0 && sA >= 360 && sA <= 720) {
        eA = 720;
      } else {
        eA += 1440;
      }
    }
    if (eB <= sB) {
      if (eB === 0 && sB >= 360 && sB <= 720) {
        eB = 720;
      } else {
        eB += 1440;
      }
    }

    // Two intervals [sA, eA) and [sB, eB) overlap if:
    // sA < eB && sB < eA
    return sA < eB && sB < eA;
  }

  // Fallback string equality check if minutes could not be parsed
  if (!startA || !startB) return false;
  return startA.trim().toLowerCase() === startB.trim().toLowerCase();
};

/**
 * Validates that startTime and endTime are properly formatted and startTime is before endTime
 * @param {string} startTime
 * @param {string} endTime
 * @throws {ApiError}
 */
const validateTimeRange = (startTime, endTime) => {
  const s = timeStringToMinutes(startTime);
  const e = timeStringToMinutes(endTime);

  if (s === null) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Invalid start time format: '${startTime}'. Use format like '09:00 AM' or '14:00'`);
  }
  if (e === null) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Invalid end time format: '${endTime}'. Use format like '10:00 AM' or '15:00'`);
  }
  if (s >= e) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Start time (${startTime}) must be earlier than end time (${endTime})`);
  }
};

/**
 * Check if a new slot overlaps with any existing slot in a list of slots
 * @param {{ startTime: string, endTime: string, _id?: any }} newSlot
 * @param {Array<{ startTime: string, endTime: string, _id?: any }>} existingSlots
 * @param {string|null} excludeSlotId
 * @returns {{ startTime: string, endTime: string, _id?: any }|null} conflicting slot or null
 */
const findOverlappingSlot = (newSlot, existingSlots = [], excludeSlotId = null) => {
  if (!newSlot || !Array.isArray(existingSlots) || existingSlots.length === 0) return null;

  const newStart = newSlot.startTime;
  const newEnd = resolveEndTime(newSlot.startTime, newSlot.endTime);

  for (const slot of existingSlots) {
    if (excludeSlotId && slot._id && slot._id.toString() === excludeSlotId.toString()) {
      continue;
    }
    const slotStart = slot.startTime;
    const slotEnd = resolveEndTime(slot.startTime, slot.endTime);

    if (isTimeOverlapping(newStart, newEnd, slotStart, slotEnd)) {
      return slot;
    }
  }

  return null;
};

/**
 * Validate an array of slots for internal overlaps and proper time ranges
 * @param {Array<{ startTime: string, endTime: string }>} slots
 * @param {string} dayName
 * @throws {ApiError}
 */
const validateSlotsSchedule = (slots = [], dayName = '') => {
  if (!Array.isArray(slots) || slots.length <= 1) return;

  for (let i = 0; i < slots.length; i++) {
    const slotA = slots[i];
    validateTimeRange(slotA.startTime, slotA.endTime);

    for (let j = i + 1; j < slots.length; j++) {
      const slotB = slots[j];
      const endA = resolveEndTime(slotA.startTime, slotA.endTime);
      const endB = resolveEndTime(slotB.startTime, slotB.endTime);

      if (isTimeOverlapping(slotA.startTime, endA, slotB.startTime, endB)) {
        const prefix = dayName ? `On ${dayName}, ` : '';
        throw new ApiError(
          httpStatus.CONFLICT,
          `${prefix}time slot ${slotA.startTime} – ${slotA.endTime} overlaps with ${slotB.startTime} – ${slotB.endTime}. Please ensure time slots do not collapse.`
        );
      }
    }
  }
};

module.exports = {
  timeStringToMinutes,
  minutesToTimeString,
  resolveEndTime,
  isTimeOverlapping,
  validateTimeRange,
  findOverlappingSlot,
  validateSlotsSchedule
};
