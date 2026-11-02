/**
 * Daily Reminder Notifications Module for Streakly
 * Handles browser notification permissions, user-selected time scheduling,
 * and service worker notifications.
 */

import { getState, setReminderSettings } from './storage.js';

let reminderTimerId = null;

/**
 * Initializes notification scheduling based on saved user settings.
 */
export function initNotifications() {
  const state = getState();
  const settings = state.userProfile;

  if (settings.reminderEnabled && settings.reminderTime) {
    scheduleNextReminder(settings.reminderTime);
  }
}

/**
 * Requests browser permission for notifications.
 */
export async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    alert('This browser does not support desktop or mobile notifications.');
    return false;
  }

  if (Notification.permission === 'granted') {
    return true;
  }

  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }

  return false;
}

/**
 * Schedules the reminder timer for the selected "HH:MM" time.
 */
export function scheduleNextReminder(timeStr) {
  if (reminderTimerId) {
    clearTimeout(reminderTimerId);
    reminderTimerId = null;
  }

  if (!timeStr) return;

  const [hours, minutes] = timeStr.split(':').map(n => parseInt(n, 10));
  const now = new Date();
  const target = new Date();
  target.setHours(hours, minutes, 0, 0);

  // If time already passed today, schedule for tomorrow
  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1);
  }

  const delayMs = target.getTime() - now.getTime();
  console.log(`Streakly: Next daily reminder scheduled in ${Math.round(delayMs / 60000)} minutes.`);

  reminderTimerId = setTimeout(() => {
    fireReminderNotification();
    // Schedule next day's reminder
    scheduleNextReminder(timeStr);
  }, delayMs);
}

/**
 * Fires the reminder notification.
 */
export async function fireReminderNotification() {
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return;
  }

  const title = 'Streakly: Daily Habit Reminder';
  const options = {
    body: 'Time to check off your 30-day habits and log your ratings for today!',
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    tag: 'streakly-daily-reminder',
    renotify: true
  };

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      if (reg && reg.showNotification) {
        reg.showNotification(title, options);
        return;
      }
    }
    new Notification(title, options);
  } catch (err) {
    console.warn('Failed to fire notification:', err);
  }
}

