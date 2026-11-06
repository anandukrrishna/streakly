/**
 * Screen 3: Analysis Module for Streakly
 * Progress ring, habit bar chart, daily line chart, best/worst day of the week,
 * weekly trend breakdown, category rating averages with trend arrows,
 * GitHub-style 30-day heatmap calendar, cycle-to-cycle comparison chart,
 * and smart plain-English insights.
 */

import {
  getState,
  calculateCycleSummary,
  getHabitStreaks,
  getCategoryRatingStats
} from './storage.js';

import {
  getCycleDays,
  getTodayDayNumber,
  formatDateDisplay
} from './date-utils.js';

const analysisChartInstances = {};

/**
 * Initializes the Analysis screen.
 */
export function initAnalysisScreen() {
  const container = document.getElementById('view-analysis');
  if (!container) return;
  renderAnalysis();
}

/**
 * Main render function for Analysis screen.
 */
export function renderAnalysis(targetCycle = null) {
  const state = getState();
  const cycle = targetCycle || state.activeCycle;
  const history = state.history || [];
  const container = document.getElementById('view-analysis');
  if (!container) return;

  const cycleDays = getCycleDays(cycle.startDate);
  const habits = cycle.habits || [];
  const tracker = cycle.trackerData || {};
  const categories = cycle.categories || [];
  const totalSlots = habits.length * 30;

  // Compute habit completions
  let totalDone = 0;
  const habitStats = habits.map(h => {
    let done = 0;
    for (let d = 1; d <= 30; d++) {
      if (tracker[h.id] && tracker[h.id][d] === 1) done++;
    }
    const rate = Math.round((done / 30) * 100);
    const { activeStreak, longestStreak } = getHabitStreaks(cycle, h.id);
    totalDone += done;
    return { id: h.id, name: h.name, section: h.section, done, rate, activeStreak, longestStreak };
  });

  // Overall completion rate
  const overallRate = totalSlots > 0 ? Math.round((totalDone / totalSlots) * 100) : 0;

  // Day-of-week completions (Sunday=0 .. Saturday=6)
  const dayOfWeekStats = [
    { name: 'Sunday', short: 'Sun', done: 0, total: 0 },
    { name: 'Monday', short: 'Mon', done: 0, total: 0 },
    { name: 'Tuesday', short: 'Tue', done: 0, total: 0 },
    { name: 'Wednesday', short: 'Wed', done: 0, total: 0 },
    { name: 'Thursday', short: 'Thu', done: 0, total: 0 },
    { name: 'Friday', short: 'Fri', done: 0, total: 0 },
    { name: 'Saturday', short: 'Sat', done: 0, total: 0 }
  ];

  cycleDays.forEach(d => {
    const dow = d.dayOfWeekIndex;
    habits.forEach(h => {
      dayOfWeekStats[dow].total++;
      if (tracker[h.id] && tracker[h.id][d.dayNumber] === 1) {
        dayOfWeekStats[dow].done++;
      }
    });
  });

  dayOfWeekStats.forEach(dow => {
    dow.rate = dow.total > 0 ? Math.round((dow.done / dow.total) * 100) : 0;
  });

  const sortedDays = [...dayOfWeekStats].sort((a, b) => b.rate - a.rate);
  const bestDay = sortedDays[0];
  const worstDay = sortedDays[sortedDays.length - 1];

  // Weekly Trend calculation
  const weeklyTrends = [
    { label: 'Week 1', range: 'Days 1-7', days: [1, 7], done: 0, total: 0 },
    { label: 'Week 2', range: 'Days 8-14', days: [8, 14], done: 0, total: 0 },
    { label: 'Week 3', range: 'Days 15-21', days: [15, 21], done: 0, total: 0 },
    { label: 'Week 4', range: 'Days 22-28', days: [22, 28], done: 0, total: 0 },
    { label: 'Final Days', range: 'Days 29-30', days: [29, 30], done: 0, total: 0 }
  ];

  weeklyTrends.forEach(w => {
    for (let d = w.days[0]; d <= w.days[1]; d++) {
      habits.forEach(h => {
        w.total++;
        if (tracker[h.id] && tracker[h.id][d] === 1) {
          w.done++;
        }
      });
    }
    w.rate = w.total > 0 ? Math.round((w.done / w.total) * 100) : 0;
  });

  // Calculate insights
  const insights = generateInsights(overallRate, habitStats, bestDay, worstDay, weeklyTrends, categories, cycle);

  container.innerHTML = `
    <!-- Screen Header -->
    <header class="analysis-screen-header glass-card">
      <div class="analysis-header-text">
        <h1 class="screen-title">Habit Analysis</h1>
        <p class="screen-subtitle">In-depth statistics, consistency metrics, and cycle trends.</p>
      </div>
      <div class="analysis-cycle-indicator">
        <span class="badge-dot"></span>
        <span>Cycle #${cycle.cycleNumber || 1} Performance</span>
      </div>
    </header>

    <!-- Top KPI Cards Grid -->
    <div class="analysis-kpi-grid">
      <!-- KPI 1: Circular Progress Ring -->
      <div class="kpi-card glass-card progress-ring-kpi">
        <div class="kpi-card-header">
          <span class="kpi-title">Cycle Completion</span>
        </div>
        <div class="progress-ring-wrap">
          ${renderProgressRingSVG(overallRate)}
          <div class="progress-ring-center">
            <span class="ring-pct-number">${overallRate}%</span>
            <span class="ring-pct-label">${totalDone}/${totalSlots} checks</span>
          </div>
        </div>
      </div>

      <!-- KPI 2: Best Streak & Best Habit -->
      <div class="kpi-card glass-card kpi-streaks-card">
        <div class="kpi-card-header">
          <span class="kpi-title">Highlight Habits</span>
        </div>
        <div class="kpi-highlight-list">
          <div class="kpi-stat-item">
            <div class="kpi-stat-icon icon-best-streak">
              <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"></path></svg>
            </div>
            <div class="kpi-stat-info">
              <span class="stat-meta-label">Best Active Streak</span>
              <span class="stat-main-val">${getBestActiveStreakText(habitStats)}</span>
            </div>
          </div>

          <div class="kpi-stat-item">
            <div class="kpi-stat-icon icon-star-habit">
              <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
            </div>
            <div class="kpi-stat-info">
              <span class="stat-meta-label">Star Habit</span>
              <span class="stat-main-val">${getStarHabitText(habitStats)}</span>
            </div>
          </div>

          <div class="kpi-stat-item">
            <div class="kpi-stat-icon icon-focus-habit">
              <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle></svg>
            </div>
            <div class="kpi-stat-info">
              <span class="stat-meta-label">Growth Opportunity</span>
              <span class="stat-main-val">${getWeakestHabitText(habitStats)}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- KPI 3: Best and Toughest Days -->
      <div class="kpi-card glass-card kpi-days-card">
        <div class="kpi-card-header">
          <span class="kpi-title">Day-of-Week Rhythm</span>
        </div>
        <div class="dow-kpi-box">
          <div class="dow-item dow-best">
            <div class="dow-label-row">
              <span class="dow-tag tag-best">BEST DAY</span>
              <span class="dow-name">${bestDay.name}</span>
            </div>
            <div class="dow-metric">
              <span class="dow-rate">${bestDay.rate}%</span>
              <span class="dow-sub">${bestDay.done} checks</span>
            </div>
          </div>

          <div class="dow-item dow-worst">
            <div class="dow-label-row">
              <span class="dow-tag tag-worst">TOUGHEST DAY</span>
              <span class="dow-name">${worstDay.name}</span>
            </div>
            <div class="dow-metric">
              <span class="dow-rate">${worstDay.rate}%</span>
              <span class="dow-sub">${worstDay.done} checks</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Plain English Insights Card -->
    <div class="insights-card glass-card">
      <div class="insights-card-header">
        <span class="insights-icon">
          <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none"><line x1="9" y1="18" x2="15" y2="18"></line><line x1="10" y1="22" x2="14" y2="22"></line><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"></path></svg>
        </span>
        <h2 class="insights-title">Smart Insights & Observations</h2>
      </div>
      <div class="insights-list">
        ${insights.map(i => `
          <div class="insight-item">
            <span class="insight-bullet">${i.iconHtml || '<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none"><polyline points="20 6 9 17 4 12"></polyline></svg>'}</span>
            <p class="insight-text">${i.text}</p>
          </div>
        `).join('')}
      </div>
    </div>

    <!-- 30-Day GitHub-style Heatmap Calendar -->
    <div class="heatmap-card glass-card">
      <div class="card-header-with-action">
        <div>
          <h2 class="card-title">30-Day Consistency Heatmap</h2>
          <p class="card-subtitle">Visual intensity of daily completions across your 30-day cycle</p>
        </div>
        <div class="heatmap-legend">
          <span class="legend-text">Less</span>
          <span class="heat-box level-0" title="0%"></span>
          <span class="heat-box level-1" title="1-25%"></span>
          <span class="heat-box level-2" title="26-50%"></span>
          <span class="heat-box level-3" title="51-75%"></span>
          <span class="heat-box level-4" title="76-100%"></span>
          <span class="legend-text">More</span>
        </div>
      </div>

      <div class="heatmap-grid-scroll">
        <div class="heatmap-calendar-grid">
          ${renderHeatmapGrid(cycleDays, tracker, habits)}
        </div>
      </div>
    </div>

    <!-- Charts Row 1: Habit Completion Bar Chart & Daily Trend Line Chart -->
    <div class="charts-dual-row">
      <!-- Habit Bar Chart -->
      <div class="chart-card glass-card">
        <div class="chart-card-header">
          <h2 class="chart-title">Habit Completion Rates</h2>
          <span class="chart-sub">Percentage of 30 days completed</span>
        </div>
        <div class="chart-body" style="height: 280px;">
          <canvas id="chart-habits-bar"></canvas>
        </div>
      </div>

      <!-- Daily Line Chart -->
      <div class="chart-card glass-card">
        <div class="chart-card-header">
          <h2 class="chart-title">Daily Completion Trend</h2>
          <span class="chart-sub">Habits completed per day (Days 1–30)</span>
        </div>
        <div class="chart-body" style="height: 280px;">
          <canvas id="chart-daily-line"></canvas>
        </div>
      </div>
    </div>

    <!-- Weekly Trend & Category Averages Row -->
    <div class="charts-dual-row">
      <!-- Weekly Trend Breakdown -->
      <div class="chart-card glass-card weekly-trends-card">
        <div class="chart-card-header">
          <h2 class="chart-title">Weekly Trend Comparison</h2>
          <span class="chart-sub">Week 1 vs Week 2 vs Week 3 vs Week 4</span>
        </div>
        <div class="weekly-cards-grid">
          ${weeklyTrends.map((w, i) => {
            const prev = i > 0 ? weeklyTrends[i - 1].rate : null;
            const diff = prev !== null ? w.rate - prev : null;
            let badge = '';
            if (diff !== null) {
              if (diff > 0) badge = `<span class="trend-badge badge-up">↑ +${diff}%</span>`;
              else if (diff < 0) badge = `<span class="trend-badge badge-down">↓ ${diff}%</span>`;
              else badge = `<span class="trend-badge badge-neutral">→ 0%</span>`;
            }

            return `
              <div class="week-kpi-item">
                <div class="week-label-row">
                  <span class="week-name">${w.label}</span>
                  <span class="week-range">${w.range}</span>
                </div>
                <div class="week-val-row">
                  <span class="week-rate-val">${w.rate}%</span>
                  ${badge}
                </div>
                <div class="week-progress-track">
                  <div class="week-progress-fill" style="width: ${w.rate}%"></div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <!-- Category Rating Averages & Trends -->
      <div class="chart-card glass-card categories-averages-card">
        <div class="chart-card-header">
          <h2 class="chart-title">Category Rating Momentum</h2>
          <span class="chart-sub">Average scores and trajectory over 30 days</span>
        </div>
        <div class="cat-averages-list">
          ${categories.map(cat => {
            const stats = getCategoryRatingStats(cycle, cat.id);
            let trendClass = 'neutral';
            let trendArrow = '→';
            if (stats.trend === 'up') {
              trendClass = 'up';
              trendArrow = `↑ +${stats.trendDelta}`;
            } else if (stats.trend === 'down') {
              trendClass = 'down';
              trendArrow = `↓ ${stats.trendDelta}`;
            }

            return `
              <div class="cat-avg-item">
                <div class="cat-avg-left">
                  <span class="cat-avg-name">${escapeHtml(cat.name)}</span>
                  <span class="cat-avg-count">${stats.count} days rated</span>
                </div>
                <div class="cat-avg-right">
                  <span class="cat-avg-num">${stats.count > 0 ? stats.average.toFixed(1) : '–'}</span>
                  <span class="cat-avg-max">/5.0</span>
                  <span class="cat-trend-pill trend-${trendClass}">${trendArrow}</span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    </div>

    <!-- Cycle-to-Cycle Comparison Chart -->
    <div class="chart-card glass-card cycle-comparison-card">
      <div class="chart-card-header">
        <h2 class="chart-title">Cycle-to-Cycle Comparison</h2>
        <span class="chart-sub">Track your evolution across consecutive 30-day cycles</span>
      </div>
      <div class="chart-body" style="height: 250px;">
        <canvas id="chart-cycles-comparison"></canvas>
      </div>
    </div>
  `;

  renderAnalysisCharts(cycle, history, habitStats, cycleDays, habits);
}

/**
 * Renders the SVG circular progress ring with gradient stroke.
 */
function renderProgressRingSVG(percent) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;

  return `
    <svg class="progress-ring-svg" width="130" height="130" viewBox="0 0 130 130">
      <defs>
        <linearGradient id="ringGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#3b82f6" />
          <stop offset="50%" stop-color="#10b981" />
          <stop offset="100%" stop-color="#34d399" />
        </linearGradient>
      </defs>
      <circle class="ring-bg-circle" cx="65" cy="65" r="${radius}" stroke-width="10" />
      <circle class="ring-progress-circle"
              cx="65" cy="65" r="${radius}"
              stroke-width="10"
              stroke-dasharray="${circumference}"
              stroke-dashoffset="${offset}"
              stroke-linecap="round"
              stroke="url(#ringGradient)" />
    </svg>
  `;
}

/**
 * Renders the GitHub-style 30-day heatmap calendar grid.
 */
function renderHeatmapGrid(cycleDays, tracker, habits) {
  const totalHabits = habits.length;

  return cycleDays.map(d => {
    let dayDone = 0;
    habits.forEach(h => {
      if (tracker[h.id] && tracker[h.id][d.dayNumber] === 1) {
        dayDone++;
      }
    });

    const pct = totalHabits > 0 ? (dayDone / totalHabits) : 0;
    let level = 'level-0';
    if (pct > 0 && pct <= 0.25) level = 'level-1';
    else if (pct > 0.25 && pct <= 0.50) level = 'level-2';
    else if (pct > 0.50 && pct <= 0.75) level = 'level-3';
    else if (pct > 0.75) level = 'level-4';

    return `
      <div class="heat-tile ${level} ${d.isToday ? 'is-today-tile' : ''}"
           title="Day ${d.dayNumber} (${d.displayDate}, ${d.weekday}): ${dayDone}/${totalHabits} completed (${Math.round(pct * 100)}%)">
        <span class="heat-day-num">${d.dayNumber}</span>
      </div>
    `;
  }).join('');
}

/**
 * Initializes Chart.js charts for Analysis screen.
 */
function renderAnalysisCharts(cycle, history, habitStats, cycleDays, habits) {
  if (typeof window.Chart === 'undefined') return;

  const isDark = document.documentElement.classList.contains('dark-theme');
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)';
  const textColor = isDark ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.65)';

  // 1. Habit Completion Bar Chart
  const barCanvas = document.getElementById('chart-habits-bar');
  if (barCanvas) {
    if (analysisChartInstances.habitsBar) analysisChartInstances.habitsBar.destroy();
    
    const labels = habitStats.map(h => h.name);
    const rates = habitStats.map(h => h.rate);
    const colors = habitStats.map(h => h.section === 'professional' ? '#3b82f6' : '#10b981');

    analysisChartInstances.habitsBar = new window.Chart(barCanvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          data: rates,
          backgroundColor: colors,
          borderRadius: 6,
          borderSkipped: false
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => `Completion: ${ctx.parsed.y}%`
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              color: textColor,
              font: { size: 10 },
              maxRotation: 45,
              autoSkip: false
            }
          },
          y: {
            min: 0,
            max: 100,
            ticks: {
              stepSize: 20,
              color: textColor,
              callback: (v) => `${v}%`
            },
            grid: { color: gridColor }
          }
        }
      }
    });
  }

  // 2. Daily Completion Line Chart
  const lineCanvas = document.getElementById('chart-daily-line');
  if (lineCanvas) {
    if (analysisChartInstances.dailyLine) analysisChartInstances.dailyLine.destroy();

    const tracker = cycle.trackerData || {};
    const dailyCounts = cycleDays.map(d => {
      let count = 0;
      habits.forEach(h => {
        if (tracker[h.id] && tracker[h.id][d.dayNumber] === 1) count++;
      });
      return count;
    });

    analysisChartInstances.dailyLine = new window.Chart(lineCanvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: cycleDays.map(d => `D${d.dayNumber}`),
        datasets: [{
          data: dailyCounts,
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.15)',
          fill: true,
          tension: 0.3,
          pointRadius: 3.5,
          pointBackgroundColor: '#10b981',
          pointBorderColor: '#ffffff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (items) => {
                const idx = items[0].dataIndex;
                const d = cycleDays[idx];
                return `Day ${d.dayNumber} (${d.displayDate}, ${d.weekday})`;
              },
              label: (ctx) => `${ctx.parsed.y} of ${habits.length} habits done`
            }
          }
        },
        scales: {
          x: {
            grid: { color: gridColor },
            ticks: { color: textColor, font: { size: 10 }, autoSkip: true, maxTicksLimit: 15 }
          },
          y: {
            min: 0,
            max: Math.max(habits.length, 5),
            ticks: { stepSize: 1, color: textColor },
            grid: { color: gridColor }
          }
        }
      }
    });
  }

  // 3. Cycle-to-Cycle Comparison Chart
  const compCanvas = document.getElementById('chart-cycles-comparison');
  if (compCanvas) {
    if (analysisChartInstances.comparison) analysisChartInstances.comparison.destroy();

    const allCycles = [...history, cycle];
    const cycleLabels = allCycles.map((c, i) => `Cycle #${c.cycleNumber || i + 1}`);
    const cycleRates = allCycles.map(c => {
      if (c.summary && typeof c.summary.completionRate === 'number') {
        return c.summary.completionRate;
      }
      const sum = calculateCycleSummary(c);
      return sum ? sum.completionRate : 0;
    });

    analysisChartInstances.comparison = new window.Chart(compCanvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels: cycleLabels,
        datasets: [{
          data: cycleRates,
          backgroundColor: allCycles.map((c, i) => i === allCycles.length - 1 ? '#6366f1' : 'rgba(99, 102, 241, 0.4)'),
          borderColor: '#6366f1',
          borderWidth: 1.5,
          borderRadius: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => `Overall Completion: ${ctx.parsed.y}%`
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: textColor, font: { size: 11 } }
          },
          y: {
            min: 0,
            max: 100,
            ticks: {
              stepSize: 25,
              color: textColor,
              callback: (v) => `${v}%`
            },
            grid: { color: gridColor }
          }
        }
      }
    });
  }
}

/**
 * Generates dynamic, context-aware plain-English insights from user's data.
 */
function generateInsights(overallRate, habitStats, bestDay, worstDay, weeklyTrends, categories, cycle) {
  const items = [];

  // Best day insight
  if (bestDay && bestDay.rate > 0) {
    items.push({
      iconHtml: '<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"></path></svg>',
      text: `You do best on <strong>${bestDay.name}s</strong> with an average completion rate of <strong>${bestDay.rate}%</strong>.`
    });
  }

  // Toughest day insight
  if (worstDay && worstDay.rate < (bestDay ? bestDay.rate : 100)) {
    items.push({
      iconHtml: '<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>',
      text: `<strong>${worstDay.name}s</strong> have been your toughest days (${worstDay.rate}%). Consider frontloading your key tasks earlier in the day.`
    });
  }

  // Weakest habit
  const sortedHabits = [...habitStats].sort((a, b) => a.rate - b.rate);
  if (sortedHabits.length > 0) {
    const weakest = sortedHabits[0];
    const strongest = sortedHabits[sortedHabits.length - 1];

    if (weakest.rate < strongest.rate) {
      items.push({
        iconHtml: '<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle></svg>',
        text: `<strong>${escapeHtml(weakest.name)}</strong> is your weakest habit (${weakest.rate}% completion). Pair it with an existing routine to build stickiness.`
      });
    }

    if (strongest.rate > 0) {
      items.push({
        iconHtml: '<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>',
        text: `<strong>${escapeHtml(strongest.name)}</strong> is your star habit with <strong>${strongest.rate}%</strong> completion!`
      });
    }
  }

  // Best active streak
  const longestStreakHabit = [...habitStats].sort((a, b) => b.longestStreak - a.longestStreak)[0];
  if (longestStreakHabit && longestStreakHabit.longestStreak >= 3) {
    items.push({
      iconHtml: '<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>',
      text: `Your longest streak this cycle is <strong>${longestStreakHabit.longestStreak} days in a row</strong> on <em>${escapeHtml(longestStreakHabit.name)}</em>.`
    });
  }

  // Category rating momentum
  let topCat = null;
  let topCatAvg = 0;
  categories.forEach(cat => {
    const s = getCategoryRatingStats(cycle, cat.id);
    if (s.count > 0 && s.average > topCatAvg) {
      topCatAvg = s.average;
      topCat = cat.name;
    }
  });

  if (topCat) {
    items.push({
      iconHtml: '<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>',
      text: `<strong>${escapeHtml(topCat)}</strong> is currently your highest rated category at <strong>${topCatAvg.toFixed(1)} / 5.0</strong>.`
    });
  }

  // Fallback if fresh start
  if (items.length === 0) {
    items.push({
      iconHtml: '<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>',
      text: 'Start checking off your habits today! As you record ticks and ratings, personalized insights and trends will appear here.'
    });
  }

  return items;
}

function getBestActiveStreakText(habitStats) {
  const sorted = [...habitStats].sort((a, b) => b.activeStreak - a.activeStreak);
  if (sorted.length > 0 && sorted[0].activeStreak > 0) {
    return `${sorted[0].activeStreak} days (${escapeHtml(sorted[0].name)})`;
  }
  return '0 days';
}

function getStarHabitText(habitStats) {
  const sorted = [...habitStats].sort((a, b) => b.rate - a.rate);
  if (sorted.length > 0 && sorted[0].rate > 0) {
    return `${escapeHtml(sorted[0].name)} (${sorted[0].rate}%)`;
  }
  return 'None yet';
}

function getWeakestHabitText(habitStats) {
  const sorted = [...habitStats].sort((a, b) => a.rate - b.rate);
  if (sorted.length > 0) {
    return `${escapeHtml(sorted[0].name)} (${sorted[0].rate}%)`;
  }
  return 'None yet';
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

