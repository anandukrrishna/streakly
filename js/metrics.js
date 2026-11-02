/**
 * Screen 2: Habit Metrics Module for Streakly
 * 3 customizable categories, 30-day rating inputs (1-5) with color gradients,
 * month averages, and Chart.js line graphs with dots and gaps for unrated days.
 */

import {
  getState,
  setMetricRating,
  renameCategory,
  getCategoryRatingStats
} from './storage.js';

import {
  getCycleDays,
  getTodayDayNumber,
  formatDateDisplay
} from './date-utils.js';

// Chart.js instances map to clean up on re-render
const chartInstances = {};

// Color themes for the three categories
const CATEGORY_COLORS = [
  {
    primary: '#8b5cf6',
    border: '#a78bfa',
    bg: 'rgba(139, 92, 246, 0.15)',
    pointBg: '#c4b5fd',
    accentGrad: 'linear-gradient(135deg, rgba(139, 92, 246, 0.25), rgba(168, 85, 247, 0.1))'
  },
  {
    primary: '#06b6d4',
    border: '#38bdf8',
    bg: 'rgba(6, 182, 212, 0.15)',
    pointBg: '#7dd3fc',
    accentGrad: 'linear-gradient(135deg, rgba(6, 182, 212, 0.25), rgba(59, 130, 246, 0.1))'
  },
  {
    primary: '#f59e0b',
    border: '#fbbf24',
    bg: 'rgba(245, 158, 11, 0.15)',
    pointBg: '#fde68a',
    accentGrad: 'linear-gradient(135deg, rgba(245, 158, 11, 0.25), rgba(236, 72, 153, 0.1))'
  }
];

/**
 * Initializes the Habit Metrics screen.
 */
export function initMetricsScreen() {
  const container = document.getElementById('view-metrics');
  if (!container) return;
  renderMetrics();
}

/**
 * Main render function for Habit Metrics screen.
 */
export function renderMetrics(targetCycle = null) {
  const state = getState();
  const cycle = targetCycle || state.activeCycle;
  const isReadOnly = Boolean(cycle.isCompleted);
  const container = document.getElementById('view-metrics');
  if (!container) return;

  const cycleDays = getCycleDays(cycle.startDate);
  const todayDayNumber = getTodayDayNumber(cycle.startDate);
  const categories = cycle.categories || [];
  const ratingsData = cycle.ratingsData || {};

  container.innerHTML = `
    <!-- Screen Header -->
    <header class="metrics-screen-header glass-card">
      <div class="metrics-header-text">
        <h1 class="screen-title">Habit Metrics</h1>
        <p class="screen-subtitle">Rate each day on a 1 to 5 scale. Track your emotional, physical, and professional momentum over 30 days.</p>
      </div>

      <!-- Rating Scale Legend -->
      <div class="metrics-legend-bar">
        <span class="legend-scale-label">Score Scale:</span>
        <div class="scale-pills-row">
          <span class="scale-pill score-1">1 Tough</span>
          <span class="scale-pill score-2">2 Low</span>
          <span class="scale-pill score-3">3 Average</span>
          <span class="scale-pill score-4">4 Good</span>
          <span class="scale-pill score-5">5 Peak</span>
        </div>
      </div>
    </header>

    <!-- 3 Category Cards -->
    <div class="metrics-cards-grid">
      ${categories.map((cat, idx) => {
        const theme = CATEGORY_COLORS[idx % CATEGORY_COLORS.length];
        const stats = getCategoryRatingStats(cycle, cat.id);
        const catRatings = ratingsData[cat.id] || {};

        return `
          <div class="metric-category-card glass-card" data-category-id="${cat.id}" style="--cat-accent: ${theme.primary}">
            <!-- Category Card Header -->
            <div class="metric-card-header">
              <div class="cat-title-wrap">
                <span class="cat-accent-circle" style="background: ${theme.primary}"></span>
                <h2 class="cat-title-text" id="cat-title-${cat.id}">${escapeHtml(cat.name)}</h2>
                ${!isReadOnly ? `
                  <button class="icon-btn btn-rename-cat" data-id="${cat.id}" title="Rename category" aria-label="Rename category">
                    <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" stroke-width="2" fill="none"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                  </button>
                ` : ''}
              </div>

              <!-- Month Average Badge -->
              <div class="cat-average-badge" title="Month average based on ${stats.count} rated days">
                <span class="avg-label">Month Avg:</span>
                <span class="avg-val">${stats.count > 0 ? stats.average.toFixed(1) : '–'}</span>
                <span class="avg-max">/5.0</span>
                ${renderTrendIcon(stats.trend, stats.trendDelta)}
              </div>
            </div>

            <!-- 30-Day Ratings Horizontal Strip -->
            <div class="ratings-strip-container">
              <div class="ratings-strip-scroll">
                <div class="ratings-grid">
                  <!-- Row 1: Day Numbers & Real Date -->
                  <div class="ratings-days-row">
                    ${cycleDays.map(d => {
                      const isToday = d.dayNumber === todayDayNumber;
                      return `
                        <div class="rating-day-col ${d.isWeekend ? 'weekend' : ''} ${isToday ? 'today' : ''}">
                          <span class="r-day-num">D${d.dayNumber}</span>
                          <span class="r-day-date">${d.displayDate}</span>
                        </div>
                      `;
                    }).join('')}
                  </div>

                  <!-- Row 2: 30 Rating Inputs (1..5) -->
                  <div class="ratings-inputs-row">
                    ${cycleDays.map(d => {
                      const val = catRatings[d.dayNumber];
                      const hasVal = (typeof val === 'number' && val >= 1 && val <= 5);
                      const isToday = d.dayNumber === todayDayNumber;

                      return `
                        <button class="rating-input-cell score-${hasVal ? val : 'empty'} ${isToday ? 'today-cell' : ''}"
                                data-category-id="${cat.id}"
                                data-day="${d.dayNumber}"
                                data-val="${hasVal ? val : ''}"
                                ${isReadOnly ? 'disabled' : ''}
                                title="Day ${d.dayNumber} (${d.displayDate}) rating: ${hasVal ? val + '/5' : 'Unrated'}. Click to rate.">
                          <span class="rating-cell-val">${hasVal ? val : '–'}</span>
                        </button>
                      `;
                    }).join('')}
                  </div>
                </div>
              </div>
            </div>

            <!-- Line Graph with Dots (Chart.js) -->
            <div class="metric-chart-wrap">
              <canvas id="chart-cat-${cat.id}" class="metric-chart-canvas" height="150"></canvas>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;

  attachMetricsEvents(cycle, isReadOnly);
  renderCategoryCharts(cycle, categories);
}

/**
 * Creates or updates Chart.js line charts for each category:
 * - Days 1 to 30 along bottom
 * - 1 to 5 up side
 * - Gaps for empty days (not zeros!)
 * - No legend, no chart title
 * - Different colour for each category
 */
function renderCategoryCharts(cycle, categories) {
  if (typeof window.Chart === 'undefined') {
    console.warn('Chart.js not yet loaded in window');
    return;
  }

  const cycleDays = getCycleDays(cycle.startDate);
  const labels = cycleDays.map(d => `D${d.dayNumber}`);
  const ratingsData = cycle.ratingsData || {};
  const isDark = document.documentElement.classList.contains('dark-theme');
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)';
  const textColor = isDark ? 'rgba(255, 255, 255, 0.65)' : 'rgba(0, 0, 0, 0.6)';

  categories.forEach((cat, idx) => {
    const canvasId = `chart-cat-${cat.id}`;
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    // Destroy existing chart instance if present
    if (chartInstances[canvasId]) {
      chartInstances[canvasId].destroy();
      delete chartInstances[canvasId];
    }

    const theme = CATEGORY_COLORS[idx % CATEGORY_COLORS.length];
    const catRatings = ratingsData[cat.id] || {};

    // Gaps for empty days: null values with spanGaps: false
    const dataPoints = cycleDays.map(d => {
      const v = catRatings[d.dayNumber];
      return (typeof v === 'number' && v >= 1 && v <= 5) ? v : null;
    });

    const ctx = canvas.getContext('2d');
    chartInstances[canvasId] = new window.Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          data: dataPoints,
          borderColor: theme.primary,
          borderWidth: 2.5,
          backgroundColor: theme.bg,
          pointBackgroundColor: theme.primary,
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2,
          pointRadius: 4.5,
          pointHoverRadius: 7,
          pointHoverBackgroundColor: '#ffffff',
          pointHoverBorderColor: theme.primary,
          tension: 0.35,
          fill: true,
          spanGaps: false // Critical: creates gaps for empty days, never drops to zero!
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 400 },
        plugins: {
          legend: { display: false }, // No legend
          title: { display: false },  // No chart title
          tooltip: {
            backgroundColor: isDark ? 'rgba(15, 23, 42, 0.9)' : 'rgba(255, 255, 255, 0.95)',
            titleColor: isDark ? '#fff' : '#0f172a',
            bodyColor: isDark ? '#cbd5e1' : '#334155',
            borderColor: theme.primary,
            borderWidth: 1,
            padding: 10,
            displayColors: false,
            callbacks: {
              title: (items) => {
                if (!items.length) return '';
                const dayIdx = items[0].dataIndex;
                const d = cycleDays[dayIdx];
                return `Day ${d.dayNumber} (${d.displayDate}, ${d.weekday})`;
              },
              label: (context) => {
                const val = context.parsed.y;
                return val ? `Rating: ${val} / 5` : 'No rating';
              }
            }
          }
        },
        scales: {
          x: {
            grid: {
              color: gridColor,
              tickColor: 'transparent'
            },
            ticks: {
              color: textColor,
              font: { size: 10, family: '-apple-system, BlinkMacSystemFont, sans-serif' },
              maxRotation: 0,
              autoSkip: true,
              maxTicksLimit: 15
            }
          },
          y: {
            min: 1,
            max: 5,
            ticks: {
              stepSize: 1,
              color: textColor,
              font: { size: 11, family: '-apple-system, BlinkMacSystemFont, sans-serif' },
              callback: (v) => `${v}★`
            },
            grid: {
              color: gridColor
            }
          }
        }
      }
    });
  });
}

/**
 * Attaches event listeners for rating cell clicks, category renaming, etc.
 */
function attachMetricsEvents(cycle, isReadOnly) {
  const container = document.getElementById('view-metrics');
  if (!container) return;

  // Rename Category
  const renameBtns = container.querySelectorAll('.btn-rename-cat');
  renameBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const catId = btn.dataset.id;
      const cat = cycle.categories.find(c => c.id === catId);
      if (cat) {
        window.dispatchEvent(new CustomEvent('open-modal', {
          detail: {
            modalId: 'modal-rename-category',
            categoryId: catId,
            currentName: cat.name
          }
        }));
      }
    });
  });

  if (isReadOnly) return;

  // Rating Cell Click -> Open Quick Rating Picker
  const ratingCells = container.querySelectorAll('.rating-input-cell');
  ratingCells.forEach(cell => {
    cell.addEventListener('click', (e) => {
      const categoryId = cell.dataset.categoryId;
      const day = parseInt(cell.dataset.day, 10);
      const currentVal = cell.dataset.val ? parseInt(cell.dataset.val, 10) : null;
      
      openQuickRatingPicker(cell, categoryId, day, currentVal);
    });
  });
}

/**
 * Opens an ergonomic frosted glass quick rating picker directly above or anchored to the cell.
 */
function openQuickRatingPicker(anchorCell, categoryId, day, currentVal) {
  // Remove any existing rating popovers
  const existing = document.getElementById('quick-rating-popover');
  if (existing) existing.remove();

  const popover = document.createElement('div');
  popover.id = 'quick-rating-popover';
  popover.className = 'quick-rating-popover glass-card';
  popover.innerHTML = `
    <div class="popover-header">
      <span>Day ${day} Rating</span>
      <button class="popover-close-btn" aria-label="Close">&times;</button>
    </div>
    <div class="popover-options-row">
      <button class="rate-choice-btn btn-score-1 ${currentVal === 1 ? 'selected' : ''}" data-score="1" title="1 - Tough">1</button>
      <button class="rate-choice-btn btn-score-2 ${currentVal === 2 ? 'selected' : ''}" data-score="2" title="2 - Low">2</button>
      <button class="rate-choice-btn btn-score-3 ${currentVal === 3 ? 'selected' : ''}" data-score="3" title="3 - Average">3</button>
      <button class="rate-choice-btn btn-score-4 ${currentVal === 4 ? 'selected' : ''}" data-score="4" title="4 - Good">4</button>
      <button class="rate-choice-btn btn-score-5 ${currentVal === 5 ? 'selected' : ''}" data-score="5" title="5 - Peak">5</button>
      <button class="rate-choice-btn btn-score-clear" data-score="0" title="Clear rating">✕</button>
    </div>
  `;

  document.body.appendChild(popover);

  // Position popover near anchor
  const rect = anchorCell.getBoundingClientRect();
  const popoverWidth = 240;
  let left = rect.left + (rect.width / 2) - (popoverWidth / 2);
  let top = rect.top - 75;

  if (left < 10) left = 10;
  if (left + popoverWidth > window.innerWidth - 10) left = window.innerWidth - popoverWidth - 10;
  if (top < 10) top = rect.bottom + 10; // flip below if not enough room on top

  popover.style.left = `${left}px`;
  popover.style.top = `${top}px`;

  // Attach choices
  const buttons = popover.querySelectorAll('.rate-choice-btn');
  buttons.forEach(b => {
    b.addEventListener('click', () => {
      const score = parseInt(b.dataset.score, 10);
      setMetricRating(categoryId, day, score > 0 ? score : null);
      popover.remove();
      document.removeEventListener('click', outsideClick);
    });
  });

  const closeBtn = popover.querySelector('.popover-close-btn');
  closeBtn.addEventListener('click', () => {
    popover.remove();
    document.removeEventListener('click', outsideClick);
  });

  const outsideClick = (e) => {
    if (!popover.contains(e.target) && e.target !== anchorCell && !anchorCell.contains(e.target)) {
      popover.remove();
      document.removeEventListener('click', outsideClick);
    }
  };
  setTimeout(() => document.addEventListener('click', outsideClick), 50);
}

function renderTrendIcon(trend, delta) {
  if (trend === 'up') {
    return `<span class="trend-indicator trend-up" title="Trending up (+${delta})">↑ +${delta}</span>`;
  }
  if (trend === 'down') {
    return `<span class="trend-indicator trend-down" title="Trending down (${delta})">↓ ${delta}</span>`;
  }
  return `<span class="trend-indicator trend-neutral" title="Steady momentum">→</span>`;
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

