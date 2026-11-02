/**
 * Storage and State Management Module for Streakly
 * Handles LocalStorage, IndexedDB persistence, Firestore cloud sync,
 * habit mutations, calculations, and automatic 30-day cycle rollover.
 */

import {
  getCycleDays,
  getCycleEndDate,
  hasCycleEnded,
  addDays,
  formatDateISO,
  formatDateDisplay,
  getTodayDayNumber
} from './date-utils.js';

import {
  saveUserDataToCloud,
  subscribeToUserData,
  onAuthChange,
  isFirebaseConfigured
} from './firebase.js';

const STORAGE_KEY_STATE = 'streakly_state_v1';

// Initial blank template state with default habits and categories
export function createDefaultState() {
  const defaultStartDate = '2026-11-01';
  return {
    version: 1,
    userProfile: {
      name: 'Anandu Krishna',
      cycleStartDate: defaultStartDate,
      theme: 'system', // 'system' | 'dark' | 'light'
      reminderTime: '20:00',
      reminderEnabled: false
    },
    activeCycle: {
      id: `cycle_1`,
      cycleNumber: 1,
      startDate: defaultStartDate,
      endDate: getCycleEndDate(defaultStartDate),
      isCompleted: false,
      completedAt: null,
      habits: [
        // Professional Section
        { id: 'prof_1', section: 'professional', name: 'Main work task' },
        { id: 'prof_2', section: 'professional', name: 'Focused work block' },
        { id: 'prof_3', section: 'professional', name: 'Learning' },
        { id: 'prof_4', section: 'professional', name: 'Planning tomorrow' },
        // Personal Section
        { id: 'pers_1', section: 'personal', name: 'Exercise or a walk' },
        { id: 'pers_2', section: 'personal', name: 'Meditation' },
        { id: 'pers_3', section: 'personal', name: 'In bed on time' },
        { id: 'pers_4', section: 'personal', name: 'Family time' },
        { id: 'pers_5', section: 'personal', name: 'Healthy meals and water' }
      ],
      categories: [
        { id: 'cat_1', name: 'Personal life' },
        { id: 'cat_2', name: 'Professional life' },
        { id: 'cat_3', name: 'Write your own category' }
      ],
      // Blank data ready to use
      trackerData: {}, // { [habitId]: { [dayNumber]: 0 | 1 | 2 } }
      ratingsData: {}  // { [categoryId]: { [dayNumber]: 1..5 } }
    },
    history: [] // Completed past cycles
  };
}

let appState = null;
let currentAuthUser = null;
let syncStatus = 'synced'; // 'synced' | 'offline' | 'syncing'
const stateListeners = new Set();
const syncListeners = new Set();
let isCloudSyncActive = false;

/**
 * Initializes state from LocalStorage and sets up Firebase sync listeners.
 */
export function initStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_STATE);
    if (raw) {
      appState = JSON.parse(raw);
    }
  } catch (err) {
    console.warn('Failed to parse local state:', err);
  }

  if (!appState || !appState.activeCycle) {
    appState = createDefaultState();
    persistLocal();
  }

  // Update sync status based on network
  window.addEventListener('online', () => {
    updateSyncStatus('synced');
    if (currentAuthUser) {
      saveUserDataToCloud(currentAuthUser.uid, appState);
    }
  });

  window.addEventListener('offline', () => {
    updateSyncStatus('offline');
  });

  if (!navigator.onLine) {
    updateSyncStatus('offline');
  }

  // Check for automatic cycle rollover
  checkAndRunAutoRollover();

  // Listen for Firebase Auth changes
  onAuthChange((user) => {
    currentAuthUser = user;
    if (user) {
      console.log('Streakly: Signed in as', user.displayName || user.email);
      // Update name if default
      if (appState.userProfile.name === 'Anandu Krishna' && user.displayName) {
        appState.userProfile.name = user.displayName;
      }
      setupCloudSync(user.uid);
    } else {
      console.log('Streakly: Not signed in or running in offline mode');
      updateSyncStatus(navigator.onLine ? 'synced' : 'offline');
    }
    notifyStateChanged();
  });

  return appState;
}

/**
 * Subscribes to Cloud Firestore updates for signed-in user.
 */
function setupCloudSync(uid) {
  if (isCloudSyncActive) return;
  isCloudSyncActive = true;
  updateSyncStatus('syncing');

  subscribeToUserData(uid, (cloudData, meta) => {
    if (meta && meta.hasPendingWrites) {
      updateSyncStatus(navigator.onLine ? 'syncing' : 'offline');
    } else {
      updateSyncStatus(navigator.onLine ? 'synced' : 'offline');
    }

    if (cloudData && cloudData.activeCycle) {
      // Cloud has newer data
      appState = cloudData;
      persistLocal();
      checkAndRunAutoRollover();
      notifyStateChanged();
    } else {
      // First time user in cloud, push current local state to cloud
      saveUserDataToCloud(uid, appState);
    }
  }, (err) => {
    console.warn('Firestore subscription status:', err);
    updateSyncStatus('offline');
  });
}

function updateSyncStatus(status) {
  syncStatus = status;
  for (const fn of syncListeners) {
    try { fn(syncStatus); } catch (e) { console.error(e); }
  }
}

export function onSyncStatusChange(fn) {
  syncListeners.add(fn);
  fn(syncStatus);
  return () => syncListeners.delete(fn);
}

export function getSyncStatus() {
  return syncStatus;
}

export function getCurrentUser() {
  return currentAuthUser;
}

/**
 * Persists app state to LocalStorage and triggers background sync to cloud.
 */
function persistLocal() {
  try {
    localStorage.setItem(STORAGE_KEY_STATE, JSON.stringify(appState));
  } catch (err) {
    console.error('Failed to write to localStorage:', err);
  }

  if (currentAuthUser) {
    if (navigator.onLine) {
      updateSyncStatus('syncing');
      saveUserDataToCloud(currentAuthUser.uid, appState).then((ok) => {
        updateSyncStatus(ok ? 'synced' : 'offline');
      });
    } else {
      updateSyncStatus('offline');
      // Firestore offline cache will queue it automatically
      saveUserDataToCloud(currentAuthUser.uid, appState);
    }
  }
}

/**
 * Registers a state change subscriber.
 */
export function onStateChange(listener) {
  stateListeners.add(listener);
  return () => stateListeners.delete(listener);
}

function notifyStateChanged(meta = {}) {
  persistLocal();
  for (const fn of stateListeners) {
    try { fn(appState, meta); } catch (e) { console.error(e); }
  }
}

export function getState() {
  if (!appState) initStorage();
  return appState;
}

/**
 * Toggles a habit cell's status:
 * 0 (blank) -> 1 (✓ done) -> 2 (✗ not done) -> 0 (blank)
 */
export function toggleHabitStatus(habitId, dayNumber) {
  const cycle = appState.activeCycle;
  if (!cycle.trackerData) cycle.trackerData = {};
  if (!cycle.trackerData[habitId]) cycle.trackerData[habitId] = {};
  
  const current = cycle.trackerData[habitId][dayNumber] || 0;
  const next = (current + 1) % 3; // 0 -> 1 -> 2 -> 0
  
  cycle.trackerData[habitId][dayNumber] = next;
  notifyStateChanged({ type: 'habit-toggle', habitId, dayNumber, status: next });
  return next;
}

/**
 * Sets a rating for a metric category on a given day (1..5 or null/0 to clear).
 */
export function setMetricRating(categoryId, dayNumber, rating) {
  const cycle = appState.activeCycle;
  if (!cycle.ratingsData) cycle.ratingsData = {};
  if (!cycle.ratingsData[categoryId]) cycle.ratingsData[categoryId] = {};
  
  const val = (rating >= 1 && rating <= 5) ? Math.round(rating) : null;
  cycle.ratingsData[categoryId][dayNumber] = val;
  notifyStateChanged({ type: 'metric-rating', categoryId, dayNumber, rating: val });
  return val;
}

/**
 * Adds a new habit to a section ('professional' or 'personal').
 */
export function addHabit(section, name) {
  const cleanName = (name || '').trim();
  if (!cleanName) return null;
  
  const habitId = `${section}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const newHabit = {
    id: habitId,
    section: section === 'professional' ? 'professional' : 'personal',
    name: cleanName
  };
  
  appState.activeCycle.habits.push(newHabit);
  notifyStateChanged({ type: 'habit-add', habit: newHabit });
  return newHabit;
}

/**
 * Renames an existing habit.
 */
export function renameHabit(habitId, newName) {
  const cleanName = (newName || '').trim();
  if (!cleanName) return false;
  
  const habit = appState.activeCycle.habits.find(h => h.id === habitId);
  if (habit) {
    habit.name = cleanName;
    notifyStateChanged({ type: 'habit-rename', habitId, newName: cleanName });
    return true;
  }
  return false;
}

/**
 * Deletes a habit from the active cycle.
 */
export function deleteHabit(habitId) {
  const habits = appState.activeCycle.habits;
  const idx = habits.findIndex(h => h.id === habitId);
  if (idx !== -1) {
    habits.splice(idx, 1);
    if (appState.activeCycle.trackerData) {
      delete appState.activeCycle.trackerData[habitId];
    }
    notifyStateChanged({ type: 'habit-delete', habitId });
    return true;
  }
  return false;
}

/**
 * Renames a metric category.
 */
export function renameCategory(categoryId, newName) {
  const cleanName = (newName || '').trim();
  if (!cleanName) return false;
  
  const cat = appState.activeCycle.categories.find(c => c.id === categoryId);
  if (cat) {
    cat.name = cleanName;
    notifyStateChanged({ type: 'category-rename', categoryId, newName: cleanName });
    return true;
  }
  return false;
}

/**
 * Updates user profile name and/or cycle start date.
 */
export function updateProfile(name, startDateStr) {
  let updated = false;
  if (typeof name === 'string' && name.trim()) {
    appState.userProfile.name = name.trim();
    updated = true;
  }
  if (startDateStr) {
    appState.userProfile.cycleStartDate = startDateStr;
    // Update active cycle dates
    appState.activeCycle.startDate = startDateStr;
    appState.activeCycle.endDate = getCycleEndDate(startDateStr);
    updated = true;
  }
  if (updated) {
    notifyStateChanged({ type: 'profile-update' });
  }
  return updated;
}

/**
 * Updates application theme preference.
 */
export function setThemePreference(theme) {
  if (['system', 'dark', 'light'].includes(theme)) {
    appState.userProfile.theme = theme;
    notifyStateChanged({ type: 'theme-change', theme });
  }
}

/**
 * Updates daily reminder notification settings.
 */
export function setReminderSettings(enabled, time) {
  appState.userProfile.reminderEnabled = Boolean(enabled);
  if (time) appState.userProfile.reminderTime = time;
  notifyStateChanged({ type: 'reminder-change' });
}

/**
 * Calculates complete summary statistics for a cycle.
 */
export function calculateCycleSummary(cycle, previousCycle = null) {
  if (!cycle) return null;
  const habits = cycle.habits || [];
  const tracker = cycle.trackerData || {};
  const totalSlots = habits.length * 30;
  
  let totalDone = 0;
  let totalNotDone = 0;
  
  let bestHabit = null;
  let highestHabitRate = -1;
  let weakestHabit = null;
  let lowestHabitRate = 101;
  
  let longestOverallStreak = 0;
  let longestStreakHabitName = '';

  habits.forEach(h => {
    let habitDoneCount = 0;
    let currentStreak = 0;
    let maxHabitStreak = 0;
    
    for (let day = 1; day <= 30; day++) {
      const status = tracker[h.id] ? tracker[h.id][day] : 0;
      if (status === 1) {
        habitDoneCount++;
        currentStreak++;
        if (currentStreak > maxHabitStreak) {
          maxHabitStreak = currentStreak;
        }
      } else {
        currentStreak = 0;
      }
      if (status === 2) {
        totalNotDone++;
      }
    }
    
    totalDone += habitDoneCount;
    const rate = Math.round((habitDoneCount / 30) * 100);
    
    if (rate > highestHabitRate) {
      highestHabitRate = rate;
      bestHabit = { name: h.name, rate, count: habitDoneCount };
    }
    if (rate < lowestHabitRate) {
      lowestHabitRate = rate;
      weakestHabit = { name: h.name, rate, count: habitDoneCount };
    }
    
    if (maxHabitStreak > longestOverallStreak) {
      longestOverallStreak = maxHabitStreak;
      longestStreakHabitName = h.name;
    }
  });

  const completionRate = totalSlots > 0 ? Math.round((totalDone / totalSlots) * 100) : 0;
  
  // Compare with previous cycle
  let comparison = null;
  if (previousCycle && previousCycle.summary) {
    const prevRate = previousCycle.summary.completionRate || 0;
    const diff = completionRate - prevRate;
    comparison = {
      prevRate,
      diff,
      isBetter: diff >= 0,
      diffText: diff >= 0 ? `+${diff}%` : `${diff}%`
    };
  }

  return {
    completionRate,
    totalDone,
    totalNotDone,
    totalSlots,
    bestStreak: {
      streak: longestOverallStreak,
      habitName: longestStreakHabitName || 'None'
    },
    bestHabit: bestHabit || { name: 'None', rate: 0, count: 0 },
    weakestHabit: weakestHabit || { name: 'None', rate: 0, count: 0 },
    comparison
  };
}

/**
 * Checks if the current cycle has ended.
 * If ended, archives it to history, generates summary, and rolls over to next 30-day cycle.
 */
export function checkAndRunAutoRollover() {
  const current = appState.activeCycle;
  if (!current) return null;
  
  if (hasCycleEnded(current.startDate)) {
    return completeCycleAndStartNext({ isAuto: true });
  }
  return null;
}

/**
 * Finishes the current cycle, saves it in history, and starts a fresh 30-day cycle.
 * New start date is the day after the last cycle ends.
 */
export function completeCycleAndStartNext({ customStartDate = null, isAuto = false } = {}) {
  const current = appState.activeCycle;
  const previousCycle = appState.history.length > 0 ? appState.history[appState.history.length - 1] : null;
  
  // Calculate and store summary on completed cycle
  const summary = calculateCycleSummary(current, previousCycle);
  const completedCycle = {
    ...current,
    isCompleted: true,
    completedAt: new Date().toISOString(),
    summary
  };
  
  // Add to history
  appState.history.push(completedCycle);

  // Determine new start date: the day after the last cycle ends
  let nextStartDate = customStartDate;
  if (!nextStartDate) {
    const lastEndDate = current.endDate || getCycleEndDate(current.startDate);
    const dayAfter = addDays(lastEndDate, 1);
    nextStartDate = formatDateISO(dayAfter);
  }

  // Clone habits and categories to carry over
  const carriedHabits = current.habits.map(h => ({ ...h }));
  const carriedCategories = current.categories.map(c => ({ ...c }));
  
  const nextCycleNumber = (current.cycleNumber || appState.history.length) + 1;
  const newCycle = {
    id: `cycle_${nextCycleNumber}`,
    cycleNumber: nextCycleNumber,
    startDate: nextStartDate,
    endDate: getCycleEndDate(nextStartDate),
    isCompleted: false,
    completedAt: null,
    habits: carriedHabits,
    categories: carriedCategories,
    trackerData: {}, // all ticks cleared
    ratingsData: {}  // all ratings cleared
  };

  appState.activeCycle = newCycle;
  appState.userProfile.cycleStartDate = nextStartDate;

  notifyStateChanged({
    type: 'cycle-rollover',
    isAuto,
    completedCycle,
    newCycle
  });

  return { completedCycle, newCycle };
}

/**
 * Calculates current streak and longest streak for a single habit in a cycle.
 */
export function getHabitStreaks(cycle, habitId) {
  const tracker = (cycle && cycle.trackerData && cycle.trackerData[habitId]) || {};
  const todayDayNumber = getTodayDayNumber(cycle.startDate);
  
  let longestStreak = 0;
  let currentRun = 0;
  
  for (let day = 1; day <= 30; day++) {
    const val = tracker[day];
    if (val === 1) {
      currentRun++;
      if (currentRun > longestStreak) {
        longestStreak = currentRun;
      }
    } else {
      currentRun = 0;
    }
  }

  // Current active streak ending at today (or yesterday if today is not yet checked)
  let activeStreak = 0;
  const checkDay = Math.min(30, Math.max(1, todayDayNumber));
  
  // If today is checked (1), count backwards from today.
  // If today is blank or not checked, check if yesterday was checked and count backwards from yesterday.
  let startBackDay = -1;
  if (tracker[checkDay] === 1) {
    startBackDay = checkDay;
  } else if (checkDay > 1 && tracker[checkDay - 1] === 1) {
    startBackDay = checkDay - 1;
  }

  if (startBackDay !== -1) {
    for (let day = startBackDay; day >= 1; day--) {
      if (tracker[day] === 1) {
        activeStreak++;
      } else {
        break;
      }
    }
  }

  return { activeStreak, longestStreak };
}

/**
 * Calculates category average rating and trend momentum.
 */
export function getCategoryRatingStats(cycle, categoryId) {
  const ratings = (cycle && cycle.ratingsData && cycle.ratingsData[categoryId]) || {};
  let sum = 0;
  let count = 0;
  
  const entries = [];
  for (let day = 1; day <= 30; day++) {
    const val = ratings[day];
    if (typeof val === 'number' && val >= 1 && val <= 5) {
      sum += val;
      count++;
      entries.push({ day, val });
    }
  }

  const average = count > 0 ? (sum / count) : 0;
  
  // Trend comparison: compare second half of entries to first half
  let trend = 'neutral'; // 'up' | 'down' | 'neutral'
  let trendDelta = 0;
  if (entries.length >= 4) {
    const mid = Math.floor(entries.length / 2);
    const firstHalf = entries.slice(0, mid);
    const secondHalf = entries.slice(mid);
    
    const avg1 = firstHalf.reduce((a, b) => a + b.val, 0) / firstHalf.length;
    const avg2 = secondHalf.reduce((a, b) => a + b.val, 0) / secondHalf.length;
    trendDelta = Math.round((avg2 - avg1) * 10) / 10;
    
    if (trendDelta >= 0.2) trend = 'up';
    else if (trendDelta <= -0.2) trend = 'down';
  }

  return {
    average: Math.round(average * 10) / 10,
    count,
    trend,
    trendDelta
  };
}

/**
 * Exports all application data as a JSON string.
 */
export function exportDataAsJSON() {
  return JSON.stringify(appState, null, 2);
}

/**
 * Imports application data from a JSON string, with validation.
 */
export function importDataFromJSON(jsonString) {
  try {
    const parsed = JSON.parse(jsonString);
    if (!parsed || !parsed.activeCycle || !Array.isArray(parsed.activeCycle.habits)) {
      throw new Error('Invalid Streakly backup file structure.');
    }
    appState = parsed;
    persistLocal();
    notifyStateChanged({ type: 'data-import' });
    return true;
  } catch (err) {
    console.error('Data import error:', err);
    throw err;
  }
}

