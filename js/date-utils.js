/**
 * Date Utilities for Streakly
 * Handles 30-day cycle calculations, formatting, and day-of-week logic.
 */

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

const FULL_MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const FULL_WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Parses a date string (YYYY-MM-DD) into a local Date object at midnight.
 */
export function parseDate(dateStr) {
  if (!dateStr) return new Date();
  if (dateStr instanceof Date) return new Date(dateStr.getFullYear(), dateStr.getMonth(), dateStr.getDate());
  
  // Handle YYYY-MM-DD
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    return new Date(year, month, day);
  }
  
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? new Date() : new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Formats a Date object as YYYY-MM-DD string.
 */
export function formatDateISO(date) {
  const d = parseDate(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Formats a date for display, e.g. "1 Nov" or "1 November 2026"
 */
export function formatDateDisplay(date, format = 'short') {
  const d = parseDate(date);
  const day = d.getDate();
  const monthShort = MONTH_NAMES[d.getMonth()];
  const monthFull = FULL_MONTH_NAMES[d.getMonth()];
  const year = d.getFullYear();
  
  if (format === 'short') {
    return `${day} ${monthShort}`;
  }
  if (format === 'full') {
    return `${day} ${monthFull} ${year}`;
  }
  if (format === 'weekday') {
    return WEEKDAY_NAMES[d.getDay()];
  }
  return `${day} ${monthShort}`;
}

/**
 * Adds N days to a date string or Date object.
 */
export function addDays(date, days) {
  const d = parseDate(date);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Generates the array of 30 days for a cycle given its start date.
 * Returns an array of objects:
 * { dayNumber: 1..30, dateISO: 'YYYY-MM-DD', displayDate: '1 Nov', weekday: 'Sun', isWeekend: true/false, isToday: true/false }
 */
export function getCycleDays(startDateStr) {
  const start = parseDate(startDateStr);
  const todayISO = formatDateISO(new Date());
  const days = [];
  
  for (let i = 0; i < 30; i++) {
    const current = addDays(start, i);
    const dateISO = formatDateISO(current);
    const dayOfWeek = current.getDay();
    const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6); // Sunday = 0, Saturday = 6
    const isToday = (dateISO === todayISO);
    
    days.push({
      dayNumber: i + 1,
      dateISO,
      displayDate: formatDateDisplay(current, 'short'),
      fullDate: formatDateDisplay(current, 'full'),
      weekday: WEEKDAY_NAMES[dayOfWeek],
      fullWeekday: FULL_WEEKDAYS[dayOfWeek],
      dayOfWeekIndex: dayOfWeek,
      isWeekend,
      isToday
    });
  }
  
  return days;
}

/**
 * Computes the end date for a 30-day cycle (Day 30 = start + 29 days).
 */
export function getCycleEndDate(startDateStr) {
  const day30 = addDays(startDateStr, 29);
  return formatDateISO(day30);
}

/**
 * Checks if a cycle has ended relative to today.
 * A 30-day cycle ends when today is strictly past the cycle's 30th day.
 */
export function hasCycleEnded(startDateStr) {
  const endDateISO = getCycleEndDate(startDateStr);
  const todayISO = formatDateISO(new Date());
  return todayISO > endDateISO;
}

/**
 * Returns which day of the 30-day cycle today corresponds to (1..30),
 * or 0 if before start, or >30 if past end.
 */
export function getTodayDayNumber(startDateStr) {
  const start = parseDate(startDateStr);
  const today = parseDate(new Date());
  const diffTime = today.getTime() - start.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  return diffDays + 1; // 1-based day index
}

