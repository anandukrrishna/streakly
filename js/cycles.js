/**
 * Cycles & History Module for Streakly
 * Handles past cycle browsing, read-only inspection, manual early rollover,
 * and the "Cycle complete" summary modal card.
 */

import {
  getState,
  completeCycleAndStartNext,
  calculateCycleSummary,
  updateProfile
} from './storage.js';

import {
  formatDateDisplay,
  formatDateISO,
  addDays,
  getCycleEndDate
} from './date-utils.js';

let inspectedCycleId = null; // null means active cycle, or ID of history cycle

/**
 * Initializes the History screen.
 */
export function initHistoryScreen() {
  const container = document.getElementById('view-history');
  if (!container) return;
  renderHistory();
}

/**
 * Main render function for History screen.
 */
export function renderHistory() {
  const state = getState();
  const activeCycle = state.activeCycle;
  const history = state.history || [];
  const container = document.getElementById('view-history');
  if (!container) return;

  const currentSummary = calculateCycleSummary(activeCycle);

  container.innerHTML = `
    <!-- Header -->
    <header class="history-screen-header glass-card">
      <div class="history-header-text">
        <h1 class="screen-title">Cycle History</h1>
        <p class="screen-subtitle">Browse your 30-day journey, review past achievements, or start a new cycle.</p>
      </div>

      <div class="history-actions-bar">
        <button class="btn-primary-glass" id="btn-start-early-cycle">
          <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2.5" fill="none"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          Start New Cycle Early
        </button>
      </div>
    </header>

    <!-- Active Cycle Overview Card -->
    <div class="active-cycle-banner glass-card">
      <div class="active-cycle-header">
        <div class="active-tag-wrap">
          <span class="pulse-indicator"></span>
          <span class="active-tag-text">CURRENT ACTIVE CYCLE</span>
        </div>
        <h2 class="active-cycle-title">Cycle #${activeCycle.cycleNumber || 1}</h2>
        <span class="active-cycle-dates">${formatDateDisplay(activeCycle.startDate, 'full')} – ${formatDateDisplay(activeCycle.endDate, 'full')}</span>
      </div>

      <div class="active-cycle-kpis">
        <div class="active-kpi">
          <span class="ak-val">${currentSummary ? currentSummary.completionRate : 0}%</span>
          <span class="ak-lbl">Current Completion</span>
        </div>
        <div class="active-kpi">
          <span class="ak-val">${activeCycle.habits ? activeCycle.habits.length : 0}</span>
          <span class="ak-lbl">Tracked Habits</span>
        </div>
        <div class="active-kpi">
          <span class="ak-val">${currentSummary ? currentSummary.bestStreak.streak : 0}d</span>
          <span class="ak-lbl">Best Streak</span>
        </div>
      </div>

      <div class="active-cycle-footer">
        <button class="btn-secondary-glass" id="btn-view-active-tracker">
          View Active Tracker Table →
        </button>
      </div>
    </div>

    <!-- Past Cycles List -->
    <div class="past-cycles-section">
      <h3 class="section-heading">Completed Past Cycles (${history.length})</h3>

      ${history.length === 0 ? `
        <div class="empty-history-card glass-card">
          <div class="empty-icon">🌱</div>
          <h4>Your first cycle is currently underway!</h4>
          <p>When Day 30 ends, your cycle will automatically archive here with full performance statistics, streaks, and comparisons.</p>
        </div>
      ` : `
        <div class="history-cards-grid">
          ${history.slice().reverse().map((c, idx) => {
            const sum = c.summary || calculateCycleSummary(c);
            return `
              <div class="history-item-card glass-card" data-cycle-id="${c.id}">
                <div class="hist-card-top">
                  <div class="hist-badge">Cycle #${c.cycleNumber || (history.length - idx)}</div>
                  <span class="hist-date-range">${formatDateDisplay(c.startDate, 'short')} – ${formatDateDisplay(c.endDate, 'short')}</span>
                </div>

                <div class="hist-stats-row">
                  <div class="hist-stat">
                    <span class="h-stat-num">${sum ? sum.completionRate : 0}%</span>
                    <span class="h-stat-lbl">Completion</span>
                  </div>
                  <div class="hist-stat">
                    <span class="h-stat-num">${sum ? sum.bestStreak.streak : 0}d</span>
                    <span class="h-stat-lbl">Best Streak</span>
                  </div>
                  <div class="hist-stat">
                    <span class="h-stat-num">${c.habits ? c.habits.length : 0}</span>
                    <span class="h-stat-lbl">Habits</span>
                  </div>
                </div>

                <div class="hist-summary-highlights">
                  <div class="hist-highlight-line">
                    <span class="hl-icon">🏆</span>
                    <span class="hl-text">Star: <strong>${escapeHtml(sum && sum.bestHabit ? sum.bestHabit.name : '–')}</strong></span>
                  </div>
                  ${sum && sum.comparison ? `
                    <div class="hist-highlight-line">
                      <span class="hl-icon">${sum.comparison.isBetter ? '📈' : '📉'}</span>
                      <span class="hl-text">${sum.comparison.diffText} vs previous cycle</span>
                    </div>
                  ` : ''}
                </div>

                <div class="hist-card-actions">
                  <button class="btn-inspect-cycle btn-secondary-glass" data-cycle-id="${c.id}">
                    Inspect Full Tracker & Ratings
                  </button>
                  <button class="btn-summary-card-open icon-btn" data-cycle-id="${c.id}" title="View Summary Card">
                    <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `}
    </div>
  `;

  attachHistoryEvents();
}

/**
 * Attaches event listeners for History screen.
 */
function attachHistoryEvents() {
  const container = document.getElementById('view-history');
  if (!container) return;

  // Start Early Cycle Button
  const btnStartEarly = container.querySelector('#btn-start-early-cycle');
  if (btnStartEarly) {
    btnStartEarly.addEventListener('click', () => {
      openEarlyCycleModal();
    });
  }

  // View Active Tracker Table Button
  const btnViewActive = container.querySelector('#btn-view-active-tracker');
  if (btnViewActive) {
    btnViewActive.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('navigate-view', { detail: { view: 'tracker', cycle: null } }));
    });
  }

  // Inspect Past Cycle Buttons
  const inspectBtns = container.querySelectorAll('.btn-inspect-cycle');
  inspectBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const cycleId = btn.dataset.cycleId;
      const state = getState();
      const pastCycle = (state.history || []).find(c => c.id === cycleId);
      if (pastCycle) {
        window.dispatchEvent(new CustomEvent('navigate-view', { detail: { view: 'tracker', cycle: pastCycle } }));
      }
    });
  });

  // Open Summary Card Button
  const summaryBtns = container.querySelectorAll('.btn-summary-card-open');
  summaryBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const cycleId = btn.dataset.cycleId;
      const state = getState();
      const pastCycle = (state.history || []).find(c => c.id === cycleId);
      if (pastCycle) {
        showCycleCompleteSummaryModal(pastCycle, false);
      }
    });
  });
}

/**
 * Shows the "Cycle complete" summary modal card:
 * completion %, best streak, best habit, weakest habit,
 * and a comparison with the previous cycle (better or worse, and by how much).
 */
export function showCycleCompleteSummaryModal(cycle, isRollover = true) {
  const state = getState();
  const history = state.history || [];
  
  // Find previous cycle for comparison
  const cycleIndex = history.findIndex(c => c.id === cycle.id);
  const previousCycle = cycleIndex > 0 ? history[cycleIndex - 1] : (history.length > 0 ? history[history.length - 1] : null);

  const summary = cycle.summary || calculateCycleSummary(cycle, previousCycle);

  const modalOverlay = document.getElementById('modal-cycle-summary');
  if (!modalOverlay) return;

  const titleEl = modalOverlay.querySelector('#summary-modal-title');
  const cycleNumEl = modalOverlay.querySelector('#summary-cycle-num');
  const pctEl = modalOverlay.querySelector('#summary-completion-pct');
  const streakEl = modalOverlay.querySelector('#summary-best-streak');
  const bestHabitEl = modalOverlay.querySelector('#summary-best-habit');
  const weakestHabitEl = modalOverlay.querySelector('#summary-weakest-habit');
  const compWrapEl = modalOverlay.querySelector('#summary-comparison-wrap');

  if (titleEl) titleEl.textContent = isRollover ? '🎉 30-Day Cycle Complete!' : `Cycle #${cycle.cycleNumber || 1} Summary`;
  if (cycleNumEl) cycleNumEl.textContent = `${formatDateDisplay(cycle.startDate, 'short')} – ${formatDateDisplay(cycle.endDate, 'short')}`;
  if (pctEl) pctEl.textContent = `${summary.completionRate}%`;
  if (streakEl) streakEl.textContent = `${summary.bestStreak.streak} days (${escapeHtml(summary.bestStreak.habitName)})`;
  if (bestHabitEl) bestHabitEl.textContent = `${escapeHtml(summary.bestHabit.name)} (${summary.bestHabit.rate}%)`;
  if (weakestHabitEl) weakestHabitEl.textContent = `${escapeHtml(summary.weakestHabit.name)} (${summary.weakestHabit.rate}%)`;

  if (compWrapEl) {
    if (summary.comparison) {
      const isBetter = summary.comparison.isBetter;
      compWrapEl.innerHTML = `
        <div class="comp-box ${isBetter ? 'comp-better' : 'comp-worse'}">
          <span class="comp-icon">${isBetter ? '📈' : '📉'}</span>
          <div class="comp-text">
            <strong>${summary.comparison.diffText}</strong> compared to previous cycle (${summary.comparison.prevRate}%).
            <span>${isBetter ? 'Outstanding momentum! Keep raising the bar.' : 'Reflect on habits to strengthen for the next 30 days.'}</span>
          </div>
        </div>
      `;
    } else {
      compWrapEl.innerHTML = `
        <div class="comp-box comp-first">
          <span class="comp-icon">🌟</span>
          <div class="comp-text">
            <strong>First 30-day baseline established!</strong>
            <span>Your future cycles will compare progress directly against this performance.</span>
          </div>
        </div>
      `;
    }
  }

  modalOverlay.classList.add('visible');
}

/**
 * Opens early cycle restart modal with ability to edit habits before starting new cycle.
 */
export function openEarlyCycleModal() {
  const state = getState();
  const current = state.activeCycle;
  const modal = document.getElementById('modal-start-early');
  if (!modal) return;

  const listContainer = modal.querySelector('#early-habits-preview-list');
  const startDateInput = modal.querySelector('#early-start-date-input');

  // Default start date: today
  if (startDateInput) {
    startDateInput.value = formatDateISO(new Date());
  }

  if (listContainer) {
    listContainer.innerHTML = (current.habits || []).map(h => `
      <div class="early-habit-row">
        <span class="early-habit-tag ${h.section}">${h.section.toUpperCase()}</span>
        <span class="early-habit-title">${escapeHtml(h.name)}</span>
      </div>
    `).join('');
  }

  modal.classList.add('visible');
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

