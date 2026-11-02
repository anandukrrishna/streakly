/**
 * Streakly Main Application Orchestrator
 * Coordinates routing, authentication, modals, theme toggling,
 * PWA service worker registration, and reactive screen updates.
 */

import {
  initStorage,
  getState,
  onStateChange,
  onSyncStatusChange,
  getCurrentUser,
  updateProfile,
  addHabit,
  renameHabit,
  renameCategory,
  setThemePreference,
  setReminderSettings,
  completeCycleAndStartNext,
  exportDataAsJSON,
  importDataFromJSON
} from './storage.js';

import {
  signInWithGoogle,
  signOutUser,
  isFirebaseConfigured,
  setStoredFirebaseConfig,
  getStoredFirebaseConfig
} from './firebase.js';

import { initTrackerScreen, renderTracker } from './tracker.js';
import { initMetricsScreen, renderMetrics } from './metrics.js';
import { initAnalysisScreen, renderAnalysis } from './analysis.js';
import { initHistoryScreen, renderHistory, showCycleCompleteSummaryModal } from './cycles.js';
import { initNotifications, requestNotificationPermission, scheduleNextReminder } from './notifications.js';

let currentActiveView = 'tracker'; // 'tracker' | 'metrics' | 'analysis' | 'history'
let inspectedPastCycle = null;     // null = active cycle, or history cycle object

document.addEventListener('DOMContentLoaded', () => {
  // Initialize storage
  initStorage();

  // Apply saved or system theme
  applyTheme();

  // Initialize screens
  initTrackerScreen();
  initMetricsScreen();
  initAnalysisScreen();
  initHistoryScreen();

  // Initialize notifications
  initNotifications();

  // Setup navigation
  setupNavigation();

  // Setup global header & account UI
  setupHeaderAndAuth();

  // Setup modals
  setupModals();

  // Setup theme switchers
  setupThemeToggle();

  // Setup PWA Installation across Windows & Samsung Galaxy S23 Android
  setupPWAInstall();

  // Setup Windows ASUS laptop keyboard shortcuts
  setupLaptopKeyboardShortcuts();

  // Handle URL query parameter view routing (shortcuts / PWA launches)
  const urlParams = new URLSearchParams(window.location.search);
  const requestedView = urlParams.get('view');
  if (['tracker', 'metrics', 'analysis', 'history'].includes(requestedView)) {
    currentActiveView = requestedView;
  }

  // Setup reactive state listener
  onStateChange((state, meta) => {
    // If an auto-rollover occurred, show the Cycle Complete Summary modal!
    if (meta && meta.type === 'cycle-rollover' && meta.completedCycle) {
      showCycleCompleteSummaryModal(meta.completedCycle, true);
    }
    renderCurrentView();
    updateUserDisplay();
  });

  // Setup sync status indicator listener
  onSyncStatusChange((status) => {
    updateSyncIndicator(status);
  });

  // Register PWA Service Worker
  registerServiceWorker();

  // Render initial view
  renderCurrentView();
  updateUserDisplay();
});

/**
 * Updates the user's name and avatar in header & sidebar.
 */
function updateUserDisplay() {
  const state = getState();
  const authUser = getCurrentUser();
  const displayName = (authUser && authUser.displayName) ? authUser.displayName : state.userProfile.name;

  const headerNameEl = document.getElementById('header-user-name');
  const sidebarNameEl = document.getElementById('sidebar-user-name');
  const userAvatarEl = document.getElementById('user-avatar-initial');

  if (headerNameEl) headerNameEl.textContent = displayName;
  if (sidebarNameEl) sidebarNameEl.textContent = displayName;
  if (userAvatarEl) {
    const initial = displayName ? displayName.trim().charAt(0).toUpperCase() : 'A';
    userAvatarEl.textContent = initial;
  }
}

/**
 * Updates the sync status pill ("Synced" with green dot, "Offline" with amber dot).
 */
function updateSyncIndicator(status) {
  const indicator = document.getElementById('sync-status-indicator');
  const textEl = document.getElementById('sync-status-text');
  if (!indicator || !textEl) return;

  indicator.className = `sync-status-pill sync-${status}`;
  if (status === 'synced') {
    textEl.textContent = 'Synced';
    indicator.title = 'All changes saved and synced';
  } else if (status === 'syncing') {
    textEl.textContent = 'Syncing...';
    indicator.title = 'Syncing changes to cloud';
  } else {
    textEl.textContent = 'Offline';
    indicator.title = 'Running offline. Changes will sync when reconnected.';
  }
}

/**
 * Handles switching between the 4 main views:
 * tracker, metrics, analysis, history
 */
function setupNavigation() {
  const navButtons = document.querySelectorAll('[data-nav-view]');
  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetView = btn.dataset.navView;
      inspectedPastCycle = null; // reset to active cycle when clicking main nav
      navigateToView(targetView);
    });
  });

  // Listen to custom navigation events (e.g. from history inspection)
  window.addEventListener('navigate-view', (e) => {
    if (e.detail) {
      inspectedPastCycle = e.detail.cycle || null;
      navigateToView(e.detail.view || 'tracker');
    }
  });

  // Return to active cycle banner button
  const btnReturnActive = document.getElementById('btn-return-to-active');
  if (btnReturnActive) {
    btnReturnActive.addEventListener('click', () => {
      inspectedPastCycle = null;
      renderCurrentView();
    });
  }
}

export function navigateToView(viewName) {
  currentActiveView = viewName;

  // Update nav buttons active state
  document.querySelectorAll('[data-nav-view]').forEach(btn => {
    btn.classList.toggle('nav-active', btn.dataset.navView === viewName);
  });

  // Show/hide view containers
  const views = ['tracker', 'metrics', 'analysis', 'history'];
  views.forEach(v => {
    const el = document.getElementById(`view-${v}`);
    if (el) {
      el.classList.toggle('active-view', v === viewName);
    }
  });

  renderCurrentView();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderCurrentView() {
  const pastBanner = document.getElementById('past-cycle-inspection-banner');
  if (pastBanner) {
    if (inspectedPastCycle) {
      pastBanner.classList.add('visible');
      const nameEl = document.getElementById('past-banner-cycle-name');
      if (nameEl) nameEl.textContent = `Viewing Archived Cycle #${inspectedPastCycle.cycleNumber || 1}`;
    } else {
      pastBanner.classList.remove('visible');
    }
  }

  const targetCycle = inspectedPastCycle || getState().activeCycle;

  if (currentActiveView === 'tracker') {
    renderTracker(targetCycle);
  } else if (currentActiveView === 'metrics') {
    renderMetrics(targetCycle);
  } else if (currentActiveView === 'analysis') {
    renderAnalysis(targetCycle);
  } else if (currentActiveView === 'history') {
    renderHistory();
  }
}

/**
 * Configures authentication UI, Google Sign-In, and Sign Out.
 */
function setupHeaderAndAuth() {
  const btnSignIn = document.getElementById('btn-open-login-modal');
  const btnSignOut = document.getElementById('btn-user-signout');
  const btnGoogleSignIn = document.getElementById('btn-google-signin');
  const btnGuestContinue = document.getElementById('btn-guest-continue');

  if (btnSignIn) {
    btnSignIn.addEventListener('click', () => {
      openModal('modal-login');
    });
  }

  if (btnSignOut) {
    btnSignOut.addEventListener('click', async () => {
      if (confirm('Are you sure you want to sign out? Your offline data remains saved locally.')) {
        await signOutUser();
        updateUserDisplay();
      }
    });
  }

  if (btnGoogleSignIn) {
    btnGoogleSignIn.addEventListener('click', async () => {
      try {
        btnGoogleSignIn.disabled = true;
        btnGoogleSignIn.textContent = 'Connecting...';
        await signInWithGoogle();
        closeModal('modal-login');
      } catch (err) {
        alert(err.message || 'Google sign-in failed. Check your Firebase credentials in Settings.');
      } finally {
        btnGoogleSignIn.disabled = false;
        btnGoogleSignIn.innerHTML = `
          <svg viewBox="0 0 24 24" width="20" height="20">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
          </svg>
          Continue with Google
        `;
      }
    });
  }

  if (btnGuestContinue) {
    btnGuestContinue.addEventListener('click', () => {
      closeModal('modal-login');
    });
  }
}

/**
 * Manages modal dialogs: open, close, forms, backdrop clicks.
 */
function setupModals() {
  // Listen to open-modal custom events
  window.addEventListener('open-modal', (e) => {
    if (e.detail) {
      openModal(e.detail.modalId, e.detail);
    }
  });

  // Close buttons inside modals
  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => {
      const modal = btn.closest('.modal-overlay');
      if (modal) modal.classList.remove('visible');
    });
  });

  // Backdrop click to dismiss
  document.querySelectorAll('.modal-overlay').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.remove('visible');
      }
    });
  });

  // Escape key to dismiss modals
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay.visible').forEach(m => m.classList.remove('visible'));
    }
  });

  // Modal 1: Edit Profile (Name & Start Date)
  const formProfile = document.getElementById('form-edit-profile');
  if (formProfile) {
    formProfile.addEventListener('submit', (e) => {
      e.preventDefault();
      const nameInput = document.getElementById('input-profile-name');
      const dateInput = document.getElementById('input-cycle-start-date');
      if (nameInput && dateInput) {
        updateProfile(nameInput.value, dateInput.value);
        closeModal('modal-edit-profile');
      }
    });
  }

  // Modal 2: Add Habit
  const formAddHabit = document.getElementById('form-add-habit');
  if (formAddHabit) {
    formAddHabit.addEventListener('submit', (e) => {
      e.preventDefault();
      const nameInput = document.getElementById('input-habit-name');
      const sectionInput = document.getElementById('input-habit-section');
      if (nameInput && sectionInput && nameInput.value.trim()) {
        addHabit(sectionInput.value, nameInput.value.trim());
        nameInput.value = '';
        closeModal('modal-add-habit');
      }
    });
  }

  // Modal 3: Rename Habit
  const formRenameHabit = document.getElementById('form-rename-habit');
  if (formRenameHabit) {
    formRenameHabit.addEventListener('submit', (e) => {
      e.preventDefault();
      const idInput = document.getElementById('input-rename-habit-id');
      const nameInput = document.getElementById('input-rename-habit-name');
      if (idInput && nameInput && nameInput.value.trim()) {
        renameHabit(idInput.value, nameInput.value.trim());
        closeModal('modal-rename-habit');
      }
    });
  }

  // Modal 4: Rename Category
  const formRenameCat = document.getElementById('form-rename-category');
  if (formRenameCat) {
    formRenameCat.addEventListener('submit', (e) => {
      e.preventDefault();
      const idInput = document.getElementById('input-rename-cat-id');
      const nameInput = document.getElementById('input-rename-cat-name');
      if (idInput && nameInput && nameInput.value.trim()) {
        renameCategory(idInput.value, nameInput.value.trim());
        closeModal('modal-rename-category');
      }
    });
  }

  // Modal 5: Early Cycle Start
  const btnConfirmEarlyCycle = document.getElementById('btn-confirm-early-cycle');
  if (btnConfirmEarlyCycle) {
    btnConfirmEarlyCycle.addEventListener('click', () => {
      const startDateInput = document.getElementById('early-start-date-input');
      const customStartDate = startDateInput ? startDateInput.value : null;
      completeCycleAndStartNext({ customStartDate });
      closeModal('modal-start-early');
      navigateToView('tracker');
    });
  }

  // Settings Modal setup
  setupSettingsModal();
}

export function openModal(modalId, detail = {}) {
  const modal = document.getElementById(modalId);
  if (!modal) return;

  const state = getState();

  if (modalId === 'modal-edit-profile') {
    const nameInput = modal.querySelector('#input-profile-name');
    const dateInput = modal.querySelector('#input-cycle-start-date');
    if (nameInput) nameInput.value = state.userProfile.name;
    if (dateInput) dateInput.value = state.activeCycle.startDate;
  } else if (modalId === 'modal-add-habit') {
    const sectionInput = modal.querySelector('#input-habit-section');
    if (sectionInput && detail.section) {
      sectionInput.value = detail.section;
    }
    const nameInput = modal.querySelector('#input-habit-name');
    if (nameInput) {
      nameInput.value = '';
      setTimeout(() => nameInput.focus(), 100);
    }
  } else if (modalId === 'modal-rename-habit') {
    const idInput = modal.querySelector('#input-rename-habit-id');
    const nameInput = modal.querySelector('#input-rename-habit-name');
    if (idInput) idInput.value = detail.habitId || '';
    if (nameInput) {
      nameInput.value = detail.currentName || '';
      setTimeout(() => nameInput.focus(), 100);
    }
  } else if (modalId === 'modal-rename-category') {
    const idInput = modal.querySelector('#input-rename-cat-id');
    const nameInput = modal.querySelector('#input-rename-cat-name');
    if (idInput) idInput.value = detail.categoryId || '';
    if (nameInput) {
      nameInput.value = detail.currentName || '';
      setTimeout(() => nameInput.focus(), 100);
    }
  }

  modal.classList.add('visible');
}

export function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('visible');
}

/**
 * Configures the Settings Modal:
 * Reminder time, Export JSON, Import JSON, Firebase config, Print Landscape.
 */
function setupSettingsModal() {
  const btnOpenSettings = document.getElementById('btn-open-settings');
  const modal = document.getElementById('modal-settings');
  if (btnOpenSettings && modal) {
    btnOpenSettings.addEventListener('click', () => {
      populateSettingsModal();
      openModal('modal-settings');
    });
  }

  // Reminder Toggle & Time
  const toggleReminder = document.getElementById('setting-reminder-toggle');
  const timeInput = document.getElementById('setting-reminder-time');

  if (toggleReminder) {
    toggleReminder.addEventListener('change', async () => {
      if (toggleReminder.checked) {
        const granted = await requestNotificationPermission();
        if (!granted) {
          toggleReminder.checked = false;
          alert('Notification permission was not granted.');
          return;
        }
      }
      setReminderSettings(toggleReminder.checked, timeInput ? timeInput.value : '20:00');
      if (toggleReminder.checked) {
        scheduleNextReminder(timeInput ? timeInput.value : '20:00');
      }
    });
  }

  if (timeInput) {
    timeInput.addEventListener('change', () => {
      setReminderSettings(toggleReminder ? toggleReminder.checked : false, timeInput.value);
      if (toggleReminder && toggleReminder.checked) {
        scheduleNextReminder(timeInput.value);
      }
    });
  }

  // Export JSON Backup
  const btnExport = document.getElementById('btn-export-backup');
  if (btnExport) {
    btnExport.addEventListener('click', () => {
      const json = exportDataAsJSON();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const dateStr = new Date().toISOString().split('T')[0];
      a.href = url;
      a.download = `streakly-backup-${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }

  // Import JSON Backup
  const fileInput = document.getElementById('input-import-file');
  const btnTriggerImport = document.getElementById('btn-trigger-import');
  if (btnTriggerImport && fileInput) {
    btnTriggerImport.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          importDataFromJSON(evt.target.result);
          alert('Backup restored successfully!');
          closeModal('modal-settings');
        } catch (err) {
          alert('Failed to import backup: ' + err.message);
        }
      };
      reader.readAsText(file);
    });
  }

  // Firebase Config Form in Settings
  const formFirebase = document.getElementById('form-firebase-config');
  if (formFirebase) {
    formFirebase.addEventListener('submit', (e) => {
      e.preventDefault();
      const rawText = document.getElementById('textarea-firebase-config').value.trim();
      try {
        let parsed = JSON.parse(rawText);
        setStoredFirebaseConfig(parsed);
        alert('Firebase configuration saved! Please reload the app to connect.');
        location.reload();
      } catch (err) {
        alert('Invalid JSON. Please paste valid Firebase configuration object.');
      }
    });
  }

  // Print Daily Tracker (Landscape)
  const btnPrint = document.getElementById('btn-print-tracker');
  if (btnPrint) {
    btnPrint.addEventListener('click', () => {
      navigateToView('tracker');
      setTimeout(() => window.print(), 300);
    });
  }
}

function populateSettingsModal() {
  const state = getState();
  const toggleReminder = document.getElementById('setting-reminder-toggle');
  const timeInput = document.getElementById('setting-reminder-time');
  const textareaFb = document.getElementById('textarea-firebase-config');

  if (toggleReminder) toggleReminder.checked = Boolean(state.userProfile.reminderEnabled);
  if (timeInput) timeInput.value = state.userProfile.reminderTime || '20:00';
  if (textareaFb) {
    const cfg = getStoredFirebaseConfig();
    textareaFb.value = JSON.stringify(cfg, null, 2);
  }
}

/**
 * Sets up Theme Toggle (Light / Dark / System).
 */
function setupThemeToggle() {
  const toggleBtns = document.querySelectorAll('.btn-theme-toggle');
  toggleBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const isDark = document.documentElement.classList.contains('dark-theme');
      const nextTheme = isDark ? 'light' : 'dark';
      setThemePreference(nextTheme);
      applyTheme();
    });
  });

  // Listen to OS theme changes if theme is system
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const state = getState();
    if (state.userProfile.theme === 'system') {
      applyTheme();
    }
  });
}

function applyTheme() {
  const state = getState();
  const pref = state.userProfile.theme || 'system';
  let shouldBeDark = false;

  if (pref === 'dark') {
    shouldBeDark = true;
  } else if (pref === 'light') {
    shouldBeDark = false;
  } else {
    // System
    shouldBeDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  document.documentElement.classList.toggle('dark-theme', shouldBeDark);
  document.documentElement.classList.toggle('light-theme', !shouldBeDark);

  // Update theme icons
  const moonIcons = document.querySelectorAll('.icon-moon');
  const sunIcons = document.querySelectorAll('.icon-sun');
  moonIcons.forEach(i => i.style.display = shouldBeDark ? 'none' : 'block');
  sunIcons.forEach(i => i.style.display = shouldBeDark ? 'block' : 'none');
}

/**
 * Registers the Service Worker for complete offline PWA caching.
 */
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then(reg => {
          console.log('Streakly: Service Worker registered with scope:', reg.scope);
        })
        .catch(err => {
          console.warn('Streakly: Service Worker registration failed:', err);
        });
    });
  }
}

/**
 * PWA Installation System
 * Supports Chrome & Edge on Windows (ASUS) and Chrome & Samsung Internet on Android (Galaxy S23).
 */
let deferredInstallPrompt = null;

function setupPWAInstall() {
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const pwaStatusEl = document.getElementById('settings-pwa-status');

  if (isStandalone) {
    if (pwaStatusEl) pwaStatusEl.textContent = 'Installed & running standalone';
    hideInstallPrompts();
    return;
  } else {
    if (pwaStatusEl) pwaStatusEl.textContent = 'Available to install';
  }

  // Intercept Chromium & Samsung Internet install prompt
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    console.log('Streakly: PWA install prompt ready');
    showInstallPrompts();
  });

  // Track successful installation
  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    hideInstallPrompts();
    if (pwaStatusEl) pwaStatusEl.textContent = 'Installed & running standalone';
    console.log('Streakly: PWA successfully installed');
  });

  // Wire all install triggers
  document.querySelectorAll('.pwa-install-trigger').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        const { outcome } = await deferredInstallPrompt.userChoice;
        console.log('Streakly install prompt choice:', outcome);
        if (outcome === 'accepted') {
          hideInstallPrompts();
        }
        deferredInstallPrompt = null;
      } else {
        // Fallback for Samsung Internet or browsers where prompt event hasn't fired
        alert('To install Streakly:\n• In Chrome/Edge (Windows): Click the Install icon in the right side of the address bar.\n• In Samsung Internet / Chrome (Galaxy S23): Tap the menu (⋮ or ☰) and select "Add to Home screen" or "Install app".');
      }
    });
  });

  // Mobile banner dismiss button
  const btnDismissBanner = document.getElementById('btn-dismiss-install-banner');
  if (btnDismissBanner) {
    btnDismissBanner.addEventListener('click', () => {
      const banner = document.getElementById('mobile-install-banner');
      if (banner) banner.style.display = 'none';
      sessionStorage.setItem('streakly_install_banner_dismissed', 'true');
    });
  }
}

function showInstallPrompts() {
  // Show header install button
  const headerBtn = document.getElementById('header-btn-install');
  if (headerBtn) headerBtn.style.display = 'inline-flex';

  // Show sidebar install button
  const sidebarBtn = document.getElementById('sidebar-btn-install');
  if (sidebarBtn) sidebarBtn.style.display = 'flex';

  // Show mobile install banner on phone if not dismissed this session
  const bannerDismissed = sessionStorage.getItem('streakly_install_banner_dismissed');
  if (!bannerDismissed && window.innerWidth <= 900) {
    const banner = document.getElementById('mobile-install-banner');
    if (banner) banner.style.display = 'flex';
  }

  const pwaStatusEl = document.getElementById('settings-pwa-status');
  if (pwaStatusEl) pwaStatusEl.textContent = 'Ready to install on this device';
}

function hideInstallPrompts() {
  const headerBtn = document.getElementById('header-btn-install');
  if (headerBtn) headerBtn.style.display = 'none';

  const sidebarBtn = document.getElementById('sidebar-btn-install');
  if (sidebarBtn) sidebarBtn.style.display = 'none';

  const banner = document.getElementById('mobile-install-banner');
  if (banner) banner.style.display = 'none';
}

/**
 * Laptop Keyboard Shortcuts (Windows ASUS laptop)
 * 1: Daily Tracker
 * 2: Habit Metrics
 * 3: Analysis
 * 4: Cycle History
 * T: Toggle Today Card vs Full Table on Mobile/Tablet view
 */
function setupLaptopKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Ignore keystrokes when typing into input fields
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable) {
      return;
    }
    if (e.ctrlKey || e.altKey || e.metaKey) return;

    if (e.key === '1') {
      navigateToView('tracker');
    } else if (e.key === '2') {
      navigateToView('metrics');
    } else if (e.key === '3') {
      navigateToView('analysis');
    } else if (e.key === '4') {
      navigateToView('history');
    } else if (e.key === 't' || e.key === 'T') {
      // Toggle Today view vs Full Table if currently on Tracker screen
      if (currentActiveView === 'tracker') {
        const btnToday = document.getElementById('btn-toggle-today-view');
        const btnTable = document.getElementById('btn-toggle-table-view');
        const isTableActive = btnTable && btnTable.classList.contains('active');
        if (isTableActive && btnToday) btnToday.click();
        else if (btnTable) btnTable.click();
      }
    }
  });
}

