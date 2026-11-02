/**
 * Screen 1: Daily Tracker Module for Streakly
 * Renders the 30-day habit matrix, sticky header and column,
 * 3-state cell cycling (blank -> ✓ -> ✗), "Today" mobile card view,
 * habit add/rename/delete, and dynamic date calculations.
 */

import {
  getState,
  toggleHabitStatus,
  addHabit,
  renameHabit,
  deleteHabit,
  updateProfile,
  getHabitStreaks
} from './storage.js';

import {
  getCycleDays,
  getTodayDayNumber,
  formatDateDisplay,
  formatDateISO
} from './date-utils.js';

let activeMobileTab = 'today'; // 'today' | 'table'
let currentCardDay = null; // defaults to today's day number in cycle

/**
 * Initializes the Daily Tracker screen and attaches event listeners.
 */
export function initTrackerScreen() {
  const container = document.getElementById('view-tracker');
  if (!container) return;

  renderTracker();
}

/**
 * Main render function for Daily Tracker screen.
 */
export function renderTracker(targetCycle = null) {
  const state = getState();
  const cycle = targetCycle || state.activeCycle;
  const userProfile = state.userProfile;
  const isReadOnly = Boolean(cycle.isCompleted);

  const container = document.getElementById('view-tracker');
  if (!container) return;

  const cycleDays = getCycleDays(cycle.startDate);
  const todayDayNumber = getTodayDayNumber(cycle.startDate);
  
  if (currentCardDay === null) {
    // If today is within cycle, use today, otherwise default to day 1
    currentCardDay = (todayDayNumber >= 1 && todayDayNumber <= 30) ? todayDayNumber : 1;
  }

  // Habits partitioned into Professional and Personal
  const profHabits = (cycle.habits || []).filter(h => h.section === 'professional');
  const persHabits = (cycle.habits || []).filter(h => h.section === 'personal');
  const trackerData = cycle.trackerData || {};

  container.innerHTML = `
    <!-- Screen Header with Editable Title -->
    <header class="tracker-header glass-card">
      <div class="tracker-title-wrap">
        <div class="tracker-title-row">
          <h1 class="tracker-main-title" id="tracker-title-display">
            <span class="user-name-span" title="Click to edit name" id="btn-edit-name">${escapeHtml(userProfile.name)}</span>
            <span class="title-separator">|</span>
            <span class="tracker-subtitle-span">30-Day Habit Tracker</span>
          </h1>
          <button class="icon-btn edit-profile-btn" id="btn-edit-profile-modal" title="Edit name & cycle start date" aria-label="Edit details">
            <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
        </div>
        
        <div class="tracker-meta-row">
          <div class="meta-item start-date-pill" id="btn-edit-date-pill" title="Click to change cycle start date">
            <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" stroke-width="2" fill="none"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            <span>Cycle Start: <strong id="cycle-start-display">${formatDateDisplay(cycle.startDate, 'full')}</strong></span>
          </div>
          
          <div class="meta-item cycle-badge">
            <span class="badge-dot"></span>
            <span>Cycle #${cycle.cycleNumber || 1} (${cycleDays[0].displayDate} – ${cycleDays[29].displayDate})</span>
          </div>

          ${isReadOnly ? `<div class="meta-item past-badge"><span>Archived Cycle (Read Only)</span></div>` : ''}
        </div>
      </div>

      <!-- Mobile View Switcher (Today Card vs Full Table) -->
      <div class="mobile-view-toggle">
        <button class="toggle-pill ${activeMobileTab === 'today' ? 'active' : ''}" id="btn-toggle-today-view">
          <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
          Today's Card
        </button>
        <button class="toggle-pill ${activeMobileTab === 'table' ? 'active' : ''}" id="btn-toggle-table-view">
          <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
          Full 30-Day Table
        </button>
      </div>
    </header>

    <!-- Mobile "Today" Card View -->
    <div class="mobile-today-container ${activeMobileTab === 'today' ? 'visible' : 'hidden'}">
      ${renderMobileTodayCard(cycle, cycleDays, todayDayNumber, isReadOnly)}
    </div>

    <!-- Desktop & Mobile Full 30-Day Table View -->
    <div class="tracker-table-container glass-card ${activeMobileTab === 'table' ? 'mobile-table-visible' : ''}">
      <div class="table-scroll-wrapper">
        <table class="tracker-table" id="tracker-table">
          <thead>
            ${renderTableHeader(cycleDays, todayDayNumber)}
          </thead>
          <tbody>
            <!-- Professional Section -->
            <tr class="section-divider-row prof-section-row">
              <td class="sticky-col section-title-cell" colspan="1">
                <div class="section-header-content">
                  <span class="section-indicator prof-indicator"></span>
                  <span class="section-label">PROFESSIONAL</span>
                  ${!isReadOnly ? `
                    <button class="btn-add-habit-inline" data-section="professional" title="Add Professional Habit">
                      <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                      Add
                    </button>
                  ` : ''}
                </div>
              </td>
              <td colspan="31" class="section-divider-fill"></td>
            </tr>
            ${renderHabitRows(profHabits, cycle, cycleDays, todayDayNumber, isReadOnly)}

            <!-- Personal Section -->
            <tr class="section-divider-row pers-section-row">
              <td class="sticky-col section-title-cell" colspan="1">
                <div class="section-header-content">
                  <span class="section-indicator pers-indicator"></span>
                  <span class="section-label">PERSONAL</span>
                  ${!isReadOnly ? `
                    <button class="btn-add-habit-inline" data-section="personal" title="Add Personal Habit">
                      <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                      Add
                    </button>
                  ` : ''}
                </div>
              </td>
              <td colspan="31" class="section-divider-fill"></td>
            </tr>
            ${renderHabitRows(persHabits, cycle, cycleDays, todayDayNumber, isReadOnly)}
          </tbody>
          <tfoot>
            <!-- Daily Completed Bottom Row -->
            ${renderTableFooter(cycle, cycleDays, todayDayNumber)}
          </tfoot>
        </table>
      </div>
      
      <!-- Legend & Table Helper -->
      <div class="table-legend-footer">
        <div class="legend-item"><span class="legend-sample cell-sample-blank"></span> Blank (Tap to cycle)</div>
        <div class="legend-item"><span class="legend-sample cell-sample-done">✓</span> Completed</div>
        <div class="legend-item"><span class="legend-sample cell-sample-notdone">✗</span> Not done</div>
        <div class="legend-item"><span class="legend-sample cell-sample-weekend"></span> Weekend</div>
        <div class="legend-item"><span class="legend-sample cell-sample-today"></span> Today</div>
      </div>
    </div>
  `;

  attachTrackerEvents(cycle, isReadOnly);
}

/**
 * Renders the table header with 30 days, real dates, and weekdays.
 */
function renderTableHeader(cycleDays, todayDayNumber) {
  return `
    <tr class="table-header-row">
      <th class="sticky-col header-habit-col">
        <div class="habit-col-header-inner">
          <span>Habit / Activity</span>
        </div>
      </th>
      ${cycleDays.map(d => {
        const isToday = d.dayNumber === todayDayNumber;
        const colClass = [
          'day-header-col',
          d.isWeekend ? 'col-weekend' : '',
          isToday ? 'col-today' : ''
        ].filter(Boolean).join(' ');

        return `
          <th class="${colClass}" data-day="${d.dayNumber}">
            <div class="day-header-inner">
              ${isToday ? `<span class="today-micro-badge">TODAY</span>` : ''}
              <span class="day-num-label">D${d.dayNumber}</span>
              <span class="day-date-label">${d.displayDate}</span>
              <span class="day-weekday-label">${d.weekday}</span>
            </div>
          </th>
        `;
      }).join('')}
      <th class="header-done-col">
        <div class="done-col-header-inner">
          <span>Done</span>
        </div>
      </th>
    </tr>
  `;
}

/**
 * Renders habit rows for a section with sticky title, 30 day cells, and done count.
 */
function renderHabitRows(habits, cycle, cycleDays, todayDayNumber, isReadOnly) {
  if (!habits.length) {
    return `
      <tr class="empty-section-row">
        <td class="sticky-col empty-section-cell" colspan="32">
          <em>No habits in this section yet. Tap "+ Add" above to start.</em>
        </td>
      </tr>
    `;
  }

  const tracker = cycle.trackerData || {};

  return habits.map(habit => {
    const habitTracker = tracker[habit.id] || {};
    let doneCount = 0;
    
    // Count completions
    for (let d = 1; d <= 30; d++) {
      if (habitTracker[d] === 1) doneCount++;
    }

    const { activeStreak } = getHabitStreaks(cycle, habit.id);

    return `
      <tr class="habit-row" data-habit-id="${habit.id}">
        <!-- Sticky Habit Name Column -->
        <td class="sticky-col habit-name-cell">
          <div class="habit-cell-wrapper">
            <div class="habit-name-and-streak">
              <span class="habit-title" title="${escapeHtml(habit.name)}" data-action="rename" data-id="${habit.id}">
                ${escapeHtml(habit.name)}
              </span>
              ${activeStreak > 0 ? `
                <span class="streak-pill" title="${activeStreak} days in a row active streak">
                  🔥 ${activeStreak}
                </span>
              ` : ''}
            </div>
            
            ${!isReadOnly ? `
              <div class="habit-actions-overlay">
                <button class="mini-action-btn btn-rename-habit" data-id="${habit.id}" title="Rename habit" aria-label="Rename">
                  <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                </button>
                <button class="mini-action-btn btn-delete-habit" data-id="${habit.id}" title="Delete habit" aria-label="Delete">
                  <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
              </div>
            ` : ''}
          </div>
        </td>

        <!-- 30 Day Cells -->
        ${cycleDays.map(d => {
          const status = habitTracker[d.dayNumber] || 0; // 0=blank, 1=done, 2=notdone
          const isToday = d.dayNumber === todayDayNumber;
          
          let cellStateClass = 'status-blank';
          let glyphHtml = '<span class="blank-squircle"></span>';
          if (status === 1) {
            cellStateClass = 'status-done';
            glyphHtml = '<span class="glyph-done-badge"><svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="3" fill="none"><polyline points="20 6 9 17 4 12"/></svg></span>';
          } else if (status === 2) {
            cellStateClass = 'status-notdone';
            glyphHtml = '<span class="glyph-notdone-badge"><svg viewBox="0 0 24 24" width="11" height="11" stroke="currentColor" stroke-width="3" fill="none"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></span>';
          }

          const cellClasses = [
            'day-cell',
            cellStateClass,
            d.isWeekend ? 'cell-weekend' : '',
            isToday ? 'cell-today' : ''
          ].filter(Boolean).join(' ');

          return `
            <td class="${cellClasses}"
                data-habit-id="${habit.id}"
                data-day="${d.dayNumber}"
                role="button"
                tabindex="${isReadOnly ? '-1' : '0'}"
                aria-label="${escapeHtml(habit.name)} Day ${d.dayNumber}: ${status === 1 ? 'Completed' : status === 2 ? 'Not done' : 'Blank'}"
                title="Day ${d.dayNumber} (${d.displayDate}, ${d.weekday}) - Tap to toggle">
              <div class="cell-glyph-wrapper">${glyphHtml}</div>
            </td>
          `;
        }).join('')}

        <!-- Done Count Column -->
        <td class="done-count-cell">
          <div class="done-count-badge" title="${doneCount} of 30 days completed (${Math.round((doneCount/30)*100)}%)">
            <span class="done-num">${doneCount}</span>
            <span class="done-total">/30</span>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

/**
 * Renders the table footer with daily completed habits count.
 */
function renderTableFooter(cycle, cycleDays, todayDayNumber) {
  const habits = cycle.habits || [];
  const totalHabits = habits.length;
  const tracker = cycle.trackerData || {};

  return `
    <tr class="table-footer-row">
      <td class="sticky-col footer-label-cell">
        <strong>Daily Completed</strong>
      </td>
      ${cycleDays.map(d => {
        let dayDoneCount = 0;
        habits.forEach(h => {
          if (tracker[h.id] && tracker[h.id][d.dayNumber] === 1) {
            dayDoneCount++;
          }
        });

        const isToday = d.dayNumber === todayDayNumber;
        const colClass = [
          'footer-day-cell',
          d.isWeekend ? 'col-weekend' : '',
          isToday ? 'col-today' : ''
        ].filter(Boolean).join(' ');

        return `
          <td class="${colClass}">
            <span class="daily-sum-pill ${dayDoneCount > 0 ? 'has-completions' : ''}">
              ${dayDoneCount}
            </span>
          </td>
        `;
      }).join('')}
      <td class="footer-total-cell">
        <span class="total-label">${totalHabits} total</span>
      </td>
    </tr>
  `;
}

/**
 * Renders Mobile "Today" card view with big touch targets (>= 48px).
 */
function renderMobileTodayCard(cycle, cycleDays, todayDayNumber, isReadOnly) {
  const targetDayObj = cycleDays.find(d => d.dayNumber === currentCardDay) || cycleDays[0];
  const habits = cycle.habits || [];
  const tracker = cycle.trackerData || {};

  let completedTodayCount = 0;
  habits.forEach(h => {
    if (tracker[h.id] && tracker[h.id][targetDayObj.dayNumber] === 1) {
      completedTodayCount++;
    }
  });

  const completionPct = habits.length > 0 ? Math.round((completedTodayCount / habits.length) * 100) : 0;
  const isActualToday = (targetDayObj.dayNumber === todayDayNumber);

  return `
    <div class="today-card glass-card">
      <!-- Day Selector Top Bar -->
      <div class="today-card-header">
        <button class="nav-day-btn" id="btn-prev-card-day" ${targetDayObj.dayNumber <= 1 ? 'disabled' : ''} aria-label="Previous day">
          <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2.5" fill="none"><polyline points="15 18 9 12 15 6"/></svg>
        </button>

        <div class="today-title-center">
          <div class="today-badge-pill ${isActualToday ? 'is-actual-today' : ''}">
            ${isActualToday ? 'TODAY' : `DAY ${targetDayObj.dayNumber}`}
          </div>
          <h2 class="today-date-text">${targetDayObj.fullWeekday}, ${targetDayObj.displayDate}</h2>
          <span class="today-cycle-progress">Day ${targetDayObj.dayNumber} of 30</span>
        </div>

        <button class="nav-day-btn" id="btn-next-card-day" ${targetDayObj.dayNumber >= 30 ? 'disabled' : ''} aria-label="Next day">
          <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2.5" fill="none"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>

      <!-- Quick Progress Bar -->
      <div class="today-progress-bar-wrap">
        <div class="progress-bar-track">
          <div class="progress-bar-fill" style="width: ${completionPct}%"></div>
        </div>
        <div class="progress-text-row">
          <span>${completedTodayCount} of ${habits.length} habits completed</span>
          <span class="progress-pct-bold">${completionPct}%</span>
        </div>
      </div>

      <!-- Habit Big Tap Targets List -->
      <div class="today-habits-list">
        ${habits.map(habit => {
          const status = (tracker[habit.id] && tracker[habit.id][targetDayObj.dayNumber]) || 0;
          const { activeStreak } = getHabitStreaks(cycle, habit.id);

          let statusClass = 'card-status-blank';
          let statusText = 'Tap to Mark';
          let ringHtml = '<span class="ios-checkbox-ring ring-blank"></span>';

          if (status === 1) {
            statusClass = 'card-status-done';
            statusText = 'Completed';
            ringHtml = '<span class="ios-checkbox-ring ring-done"><svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" stroke-width="3" fill="none"><polyline points="20 6 9 17 4 12"/></svg></span>';
          } else if (status === 2) {
            statusClass = 'card-status-notdone';
            statusText = 'Not Done';
            ringHtml = '<span class="ios-checkbox-ring ring-notdone"><svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="3" fill="none"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></span>';
          }

          return `
            <div class="today-habit-item ${statusClass}"
                 data-habit-id="${habit.id}"
                 data-day="${targetDayObj.dayNumber}"
                 role="button"
                 tabindex="0">
              <div class="habit-item-info">
                <div class="habit-item-meta">
                  <span class="item-section-tag ${habit.section}">${habit.section.toUpperCase()}</span>
                  ${activeStreak > 0 ? `<span class="streak-pill">🔥 ${activeStreak}</span>` : ''}
                </div>
                <span class="today-habit-name">${escapeHtml(habit.name)}</span>
              </div>
              <div class="today-action-target">
                <span class="action-status-label">${statusText}</span>
                <div class="action-icon-wrap">
                  ${ringHtml}
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

/**
 * Attaches event listeners for clicks, cell cycling, habit CRUD, and modals.
 */
function attachTrackerEvents(cycle, isReadOnly) {
  const container = document.getElementById('view-tracker');
  if (!container) return;

  // Mobile View Switcher
  const btnToggleToday = container.querySelector('#btn-toggle-today-view');
  const btnToggleTable = container.querySelector('#btn-toggle-table-view');
  
  if (btnToggleToday) {
    btnToggleToday.addEventListener('click', () => {
      activeMobileTab = 'today';
      renderTracker(cycle);
    });
  }
  if (btnToggleTable) {
    btnToggleTable.addEventListener('click', () => {
      activeMobileTab = 'table';
      renderTracker(cycle);
    });
  }

  // Mobile Card Day Navigation
  const btnPrevDay = container.querySelector('#btn-prev-card-day');
  const btnNextDay = container.querySelector('#btn-next-card-day');
  if (btnPrevDay) {
    btnPrevDay.addEventListener('click', () => {
      if (currentCardDay > 1) {
        currentCardDay--;
        renderTracker(cycle);
      }
    });
  }
  if (btnNextDay) {
    btnNextDay.addEventListener('click', () => {
      if (currentCardDay < 30) {
        currentCardDay++;
        renderTracker(cycle);
      }
    });
  }

  // Edit Name & Start Date buttons
  const btnEditProfile = container.querySelector('#btn-edit-profile-modal');
  const btnEditName = container.querySelector('#btn-edit-name');
  const btnEditDatePill = container.querySelector('#btn-edit-date-pill');

  const openProfileModal = () => {
    window.dispatchEvent(new CustomEvent('open-modal', { detail: { modalId: 'modal-edit-profile' } }));
  };

  if (btnEditProfile) btnEditProfile.addEventListener('click', openProfileModal);
  if (btnEditName) btnEditName.addEventListener('click', openProfileModal);
  if (btnEditDatePill) btnEditDatePill.addEventListener('click', openProfileModal);

  if (isReadOnly) return; // In read-only mode, don't attach mutation handlers

  // Table Cell Cycling on Click / Enter
  const cells = container.querySelectorAll('.day-cell');
  cells.forEach(cell => {
    const handleToggle = () => {
      const habitId = cell.dataset.habitId;
      const day = parseInt(cell.dataset.day, 10);
      toggleHabitStatus(habitId, day);
    };

    cell.addEventListener('click', handleToggle);
    cell.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleToggle();
      }
    });
  });

  // Mobile Today Habit Cards Tapping
  const todayHabitCards = container.querySelectorAll('.today-habit-item');
  todayHabitCards.forEach(card => {
    card.addEventListener('click', () => {
      const habitId = card.dataset.habitId;
      const day = parseInt(card.dataset.day, 10);
      toggleHabitStatus(habitId, day);
    });
  });

  // Add Habit Buttons
  const addBtns = container.querySelectorAll('.btn-add-habit-inline');
  addBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const section = btn.dataset.section;
      window.dispatchEvent(new CustomEvent('open-modal', {
        detail: {
          modalId: 'modal-add-habit',
          section
        }
      }));
    });
  });

  // Rename Habit Buttons
  const renameBtns = container.querySelectorAll('.btn-rename-habit, .habit-title');
  renameBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const habitId = btn.dataset.id;
      const habit = cycle.habits.find(h => h.id === habitId);
      if (habit) {
        window.dispatchEvent(new CustomEvent('open-modal', {
          detail: {
            modalId: 'modal-rename-habit',
            habitId,
            currentName: habit.name
          }
        }));
      }
    });
  });

  // Delete Habit Buttons
  const deleteBtns = container.querySelectorAll('.btn-delete-habit');
  deleteBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const habitId = btn.dataset.id;
      const habit = cycle.habits.find(h => h.id === habitId);
      if (habit) {
        if (confirm(`Delete habit "${habit.name}" from this cycle?`)) {
          deleteHabit(habitId);
        }
      }
    });
  });
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

