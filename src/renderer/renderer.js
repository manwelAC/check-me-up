// Custom drag buttons integration
document.getElementById('minimizeBtn').addEventListener('click', () => {
  window.api.minimize();
});

document.getElementById('maximizeBtn').addEventListener('click', () => {
  window.api.maximize();
});

document.getElementById('closeBtn').addEventListener('click', () => {
  window.api.close();
});

const themeToggleBtn = document.getElementById('themeToggleBtn');
const savedTheme = localStorage.getItem('check-me-theme') || 'light';
document.body.dataset.theme = savedTheme;
if (themeToggleBtn) {
  themeToggleBtn.innerText = savedTheme;
  themeToggleBtn.addEventListener('click', () => {
    const nextTheme = document.body.dataset.theme === 'dark' ? 'light' : 'dark';
    document.body.dataset.theme = nextTheme;
    localStorage.setItem('check-me-theme', nextTheme);
    themeToggleBtn.innerText = nextTheme;
  });
}

// Extract domain keyword from window title or website brand
function extractSiteDomain(title) {
  if (!title) return null;
  let clean = title.replace(/\s*-\s*(Google Chrome|Brave|Firefox|Safari|Microsoft Edge|Edge|Opera)$/i, '').trim();
  const sites = [
    { key: 'github', domain: 'github.com' },
    { key: 'youtube', domain: 'youtube.com' },
    { key: 'stackoverflow', domain: 'stackoverflow.com' },
    { key: 'reddit', domain: 'reddit.com' },
    { key: 'twitter', domain: 'twitter.com' },
    { key: 'x.com', domain: 'twitter.com' },
    { key: 'figma', domain: 'figma.com' },
    { key: 'facebook', domain: 'facebook.com' },
    { key: 'netflix', domain: 'netflix.com' },
    { key: 'twitch', domain: 'twitch.com' },
    { key: 'gmail', domain: 'gmail.com' },
    { key: 'outlook', domain: 'outlook.com' },
    { key: 'chatgpt', domain: 'chatgpt.com' },
    { key: 'claude', domain: 'claude.ai' },
    { key: 'gemini', domain: 'gemini.google.com' }
  ];
  const lower = clean.toLowerCase();
  for (const site of sites) {
    if (lower.includes(site.key)) return site.domain;
  }
  const domainMatch = clean.match(/([a-zA-Z0-9-]+\.[a-zA-Z]{2,})/);
  if (domainMatch) return domainMatch[1];
  return null;
}

// Resolve icon URL or base64 data URL
async function resolveAppIcon(appName, appPath, windowTitle) {
  const appLower = appName.toLowerCase();
  const titleText = windowTitle || '';
  
  // Check browser split app e.g. "Brave (GitHub)" or title content
  const isBrowser = appLower.includes('chrome') || 
                    appLower.includes('brave') || 
                    appLower.includes('firefox') || 
                    appLower.includes('safari') || 
                    appLower.includes('edge') || 
                    appLower.includes('opera');
                    
  if (isBrowser || appLower.includes('browser')) {
    let domain = extractSiteDomain(titleText);
    if (!domain) {
      const match = appName.match(/^([a-zA-Z\s]+)\s\((.+)\)$/);
      if (match) domain = extractSiteDomain(match[2]);
    }
    if (domain) {
      return `https://www.google.com/s2/favicons?sz=64&domain=${domain}`;
    }
  }

  // Fallback to desktop app path
  if (appPath) {
    try {
      const dataUrl = await window.api.getAppIcon(appPath);
      if (dataUrl) return dataUrl;
    } catch (e) {
      // Ignore
    }
  }

  // Final placeholder SVG
  return "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='rgba%28255,255,255,0.25%29' d='M12 2A10 10 0 0 0 2 12a10 10 0 0 0 10 10a10 10 0 0 0 10-10A10 10 0 0 0 12 2m0 2a8 8 0 0 1 8 8a8 8 0 0 1-8 8a8 8 0 0 1-8-8a8 8 0 0 1 8-8'/%3E%3C/svg%3E";
}

// App State Cache
let activeConfigs = {};
let categoryDiagnostics = {};
let classificationOptions = { apps: [], browserTabs: [] };
let isTrackingRunning = false;
let currentUserName = '';
let timelineLoadPending = false;
let lastTimelineLoadAt = 0;

// Format duration helper (in seconds to e.g. "1h 45m")
function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return '0h 00m';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

// Format time helper (timestamp in seconds to e.g. "1:45 PM")
function formatTime(timestamp) {
  if (!timestamp) return '-';
  const date = new Date(timestamp * 1000);
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12; // the hour '0' should be '12'
  return `${hours}:${String(minutes).padStart(2, '0')} ${ampm}`;
}

// Calculate grade from focus score
function getFocusGrade(score) {
  if (score >= 90) return 'A+';
  if (score >= 80) return 'A';
  if (score >= 70) return 'B';
  if (score >= 60) return 'C';
  if (score >= 50) return 'D';
  return 'F';
}

function buildFocusInsight(metrics) {
  if (!metrics || metrics.totalTracked <= 0) {
    return {
      text: 'Start tracking to gather metrics.',
      color: 'var(--text-secondary)'
    };
  }

  if (metrics.topProductiveApp && metrics.productiveTime > 0) {
    return {
      text: `Best focus source: ${metrics.topProductiveApp.name} (${formatDuration(metrics.topProductiveApp.duration)}). Focus score is ${metrics.focusScore}%.`,
      color: metrics.focusScore >= 70 ? 'var(--productive)' : 'var(--idle)'
    };
  }

  if (metrics.topDistractingApp) {
    const windowText = metrics.worstDistractionWindow
      ? ` Peak distraction window: ${metrics.worstDistractionWindow}.`
      : '';
    return {
      text: `Main distraction: ${metrics.topDistractingApp.name} (${formatDuration(metrics.topDistractingApp.duration)}).${windowText}`,
      color: 'var(--distracting)'
    };
  }

  if (metrics.topNeutralApp) {
    return {
      text: `Most tracked neutral app: ${metrics.topNeutralApp.name} (${formatDuration(metrics.topNeutralApp.duration)}). Classify it to improve score accuracy.`,
      color: 'var(--text-secondary)'
    };
  }

  return {
    text: 'Keep tracking to build a clearer focus pattern.',
    color: 'var(--text-secondary)'
  };
}

function renderInsightCards(container, cards, fallbackText) {
  if (!container) return;
  const safeCards = Array.isArray(cards) ? cards.filter(Boolean) : [];

  if (safeCards.length === 0) {
    container.innerHTML = `<div class="weekly-insight-empty">${escapeHtml(fallbackText || 'Keep tracking to calculate insights.')}</div>`;
    return;
  }

  container.innerHTML = safeCards.map(card => {
    const type = ['productive', 'distracting', 'neutral'].includes(card.type) ? card.type : 'neutral';
    return `
      <div class="weekly-insight-card ${type}">
        <span class="weekly-insight-label">${escapeHtml(card.label)}</span>
        <span class="weekly-insight-value">${escapeHtml(card.value)}</span>
        <span class="weekly-insight-meta">${escapeHtml(card.meta)}</span>
      </div>
    `;
  }).join('');
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function normalizeDisplayName(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function applyUserName(name) {
  currentUserName = normalizeDisplayName(name);
  const sidebarUserName = document.getElementById('sidebarUserName');
  if (sidebarUserName) {
    sidebarUserName.innerText = currentUserName ? `tracking as ${currentUserName}` : 'setup pending';
  }

  const profileInput = document.getElementById('profile-user-name');
  if (profileInput) {
    profileInput.value = currentUserName;
  }
}

function getDashboardSubtitle() {
  const dateLabel = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  return currentUserName ? `${dateLabel} · ${currentUserName}'s focus breakdown` : dateLabel;
}

async function loadUserProfile() {
  const configs = await window.api.getConfigs();
  applyUserName(configs.user_name || '');
  return configs;
}

async function ensureSetupComplete(configs = null) {
  const loadedConfigs = configs || await loadUserProfile();
  const setupOverlay = document.getElementById('setupOverlay');
  const setupInput = document.getElementById('setupUserName');

  if (!setupOverlay) return true;

  const userName = normalizeDisplayName(loadedConfigs.user_name);
  if (userName) {
    setupOverlay.classList.add('hidden');
    applyUserName(userName);
    return true;
  }

  setupOverlay.classList.remove('hidden');
  requestAnimationFrame(() => setupInput?.focus());
  return false;
}

// Set up circular Focus score ring progress
const circlePerimeter = 440; // 2 * Math.PI * 70
const focusRing = document.getElementById('focusRing');
if (focusRing) {
  focusRing.style.strokeDasharray = circlePerimeter;
  focusRing.style.strokeDashoffset = circlePerimeter;
}

function updateFocusRing(score) {
  if (!focusRing) return;
  const offset = circlePerimeter - (score / 100) * circlePerimeter;
  focusRing.style.strokeDashoffset = offset;
  
  // Update Grade Color
  if (score >= 80) {
    focusRing.style.stroke = 'var(--productive)';
  } else if (score >= 50) {
    focusRing.style.stroke = 'var(--idle)';
  } else {
    focusRing.style.stroke = 'var(--distracting)';
  }
}

// TAB NAVIGATION SWITCHING
const navItems = document.querySelectorAll('.nav-item');
const tabPanels = document.querySelectorAll('.tab-panel');

navItems.forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    const tabName = item.getAttribute('data-tab');
    
    // Deactivate all navigation items
    navItems.forEach(nav => nav.classList.remove('active'));
    // Activate target
    item.classList.add('active');
    
    // Hide all panels
    tabPanels.forEach(panel => panel.classList.remove('active'));
    // Show target panel
    const targetPanel = document.getElementById(`tab-${tabName}`);
    if (targetPanel) {
      targetPanel.classList.add('active');
      // Load specific data on demand
      if (tabName === 'weekly') {
        loadWeeklyReport();
      } else if (tabName === 'timeline') {
        loadDailyTimeline(true);
      } else if (tabName === 'classifications') {
        loadClassifications();
      }
    }
  });
});

// LOAD TODAY'S METRICS & DASHBOARD
async function loadTodayDashboard() {
  try {
    const today = await window.api.getTodayMetrics();
    renderTodayMetrics(today);
    loadDailyRhythm();
  } catch (err) {
    console.error('Failed to load today metrics:', err);
  }
}

function formatHourWindow(hour) {
  if (hour === null || hour === undefined || Number.isNaN(Number(hour))) return '-';
  const startHour = Number(hour);
  const endHour = (startHour + 1) % 24;
  const formatHourOnly = (value) => {
    const ampm = value >= 12 ? 'PM' : 'AM';
    const displayHour = value % 12 === 0 ? 12 : value % 12;
    return `${displayHour}:00 ${ampm}`;
  };
  return `${formatHourOnly(startHour)} - ${formatHourOnly(endHour)}`;
}

async function loadDailyRhythm() {
  try {
    const rhythm = await window.api.getTodayRhythm();
    renderDailyRhythm(rhythm);
  } catch (err) {
    console.error('Failed to load daily rhythm:', err);
  }
}

function renderDailyRhythm(rhythm) {
  const first = document.getElementById('rhythm-first-activity');
  const last = document.getElementById('rhythm-last-activity');
  const span = document.getElementById('rhythm-active-span');
  const hour = document.getElementById('rhythm-active-hour');
  const hourDuration = document.getElementById('rhythm-active-hour-duration');

  if (!first || !last || !span || !hour || !hourDuration) return;

  if (!rhythm || rhythm.empty) {
    first.innerText = '-';
    last.innerText = '-';
    span.innerText = '0h 00m';
    hour.innerText = '-';
    hourDuration.innerText = '0h 00m tracked';
    return;
  }

  first.innerText = formatTime(rhythm.firstActivity);
  last.innerText = formatTime(rhythm.lastActivity);
  span.innerText = formatDuration(rhythm.activeSpan);
  hour.innerText = formatHourWindow(rhythm.mostActiveHour);
  hourDuration.innerText = `${formatDuration(rhythm.mostActiveHourDuration)} tracked`;
}

function getTimelineCategoryClass(category) {
  if (category === 'productive') return 'productive';
  if (category === 'distracting') return 'distracting';
  if (category === 'idle') return 'idle';
  return 'neutral';
}

async function loadDailyTimeline(force = false) {
  const container = document.getElementById('daily-timeline-container');
  if (!container) return;

  const now = Date.now();
  if (!force && (timelineLoadPending || now - lastTimelineLoadAt < 5000)) return;

  timelineLoadPending = true;
  try {
    const sessions = await window.api.getTodayTimeline();
    lastTimelineLoadAt = Date.now();
    renderDailyTimeline(sessions || []);
  } catch (err) {
    console.error('Failed to load daily timeline:', err);
  } finally {
    timelineLoadPending = false;
  }
}

function renderDailyTimeline(sessions) {
  const container = document.getElementById('daily-timeline-container');
  if (!container) return;

  container.innerHTML = '';
  if (!sessions.length) {
    container.innerHTML = `<div class="no-data-placeholder">No timeline sessions tracked yet today.</div>`;
    return;
  }

  const latestSessions = sessions.slice(-80).reverse();
  for (const session of latestSessions) {
    const catClass = getTimelineCategoryClass(session.category);
    const row = document.createElement('div');
    row.className = `timeline-row ${catClass}`;

    const timeRange = `${formatTime(session.startedAt)} - ${session.active ? 'now' : formatTime(session.endedAt)}`;
    row.innerHTML = `
      <div class="timeline-time">
        <span>${escapeHtml(timeRange)}</span>
        <span>${formatDuration(session.duration)}</span>
      </div>
      <div class="timeline-marker" aria-hidden="true"></div>
      <div class="timeline-main">
        <div class="timeline-title-row">
          <span class="timeline-app">${escapeHtml(session.appName)}</span>
          <span class="app-row-tag ${catClass}">${escapeHtml(session.category)}</span>
        </div>
        <div class="timeline-window">${escapeHtml(session.windowTitle || 'Active window')}</div>
      </div>
    `;
    container.appendChild(row);
  }
}

function renderTodayMetrics(metrics) {
  if (!metrics) return;
  
  // Set Date label
  document.getElementById('current-date-label').innerText = getDashboardSubtitle();

  // Focus Score elements
  const score = metrics.focusScore || 0;
  const scoreVal = document.getElementById('focusScoreVal');
  if (scoreVal) scoreVal.innerText = score;
  
  const scoreGrade = document.getElementById('focusScoreGrade');
  if (scoreGrade) scoreGrade.innerText = getFocusGrade(score);
  
  updateFocusRing(score);

  // Focus Score Grade Insight
  const insight = document.getElementById('insightTip');
  if (insight) {
    const focusInsight = buildFocusInsight(metrics);
    insight.innerText = focusInsight.text;
    insight.style.color = focusInsight.color;
  }

  // Duration cards
  document.getElementById('metric-total-tracked').innerText = formatDuration(metrics.totalTracked);
  document.getElementById('metric-active-productive').innerText = formatDuration(metrics.productiveTime);
  document.getElementById('metric-active-distracting').innerText = formatDuration(metrics.distractingTime);
  document.getElementById('metric-active-neutral').innerText = formatDuration(metrics.neutralTime);
  document.getElementById('metric-idle-time').innerText = formatDuration(metrics.idleTime);
  document.getElementById('metric-longest-streak').innerText = formatDuration(metrics.longestStreak);

  // Top apps table rendering
  const container = document.getElementById('top-apps-container');
  container.innerHTML = '';

  if (!metrics.apps || metrics.apps.length === 0) {
    container.innerHTML = `<div class="no-data-placeholder">No applications tracked yet today. Keep tracking!</div>`;
    return;
  }

  const maxDuration = metrics.apps[0]?.duration || 1;

  metrics.apps.slice(0, 10).forEach(app => {
    const ratio = (app.duration / maxDuration) * 100;
    const imgId = 'app-icon-' + Math.random().toString(36).substr(2, 9);
    
    const row = document.createElement('div');
    row.className = 'app-row';
    
    // Style variables for app row categories
    let catClass = 'neutral';
    if (app.category === 'productive') catClass = 'productive';
    else if (app.category === 'distracting') catClass = 'distracting';

    row.innerHTML = `
      <div class="app-row-identity">
        <img class="app-row-icon" id="${imgId}" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='rgba%28255,255,255,0.15%29' d='M12 2A10 10 0 0 0 2 12a10 10 0 0 0 10 10a10 10 0 0 0 10-10A10 10 0 0 0 12 2m0 2a8 8 0 0 1 8 8a8 8 0 0 1-8 8a8 8 0 0 1-8-8a8 8 0 0 1 8-8'/%3E%3C/svg%3E">
        <span class="app-row-name ${catClass}">${app.name}</span>
      </div>
      <div class="app-row-bar-container">
        <div class="app-row-bar-fill ${catClass}" style="width: ${ratio}%"></div>
      </div>
      <span class="app-row-duration">${formatDuration(app.duration)}</span>
      <div>
        <span class="app-row-tag ${catClass}">${app.category || 'neutral'}</span>
      </div>
    `;
    container.appendChild(row);

    // Asynchronously update icon
    resolveAppIcon(app.name, app.path, null).then(iconSrc => {
      const img = document.getElementById(imgId);
      if (img && iconSrc) img.src = iconSrc;
    });
  });
}

// REAL-TIME UPDATES VIA DAEMON IPC TICK LISTENER
window.api.onTick((data) => {
  // Update Tracking Status State
  isTrackingRunning = data.running;
  
  const statusBadge = document.getElementById('status-badge');
  const statusText = document.getElementById('status-text');
  const sidebarStatusText = document.getElementById('sidebarStatusText');
  const toggleBtn = document.getElementById('toggleDaemonBtn');
  
  // Set button text
  toggleBtn.innerText = isTrackingRunning ? 'Stop Tracking' : 'Start Tracking';
  
  // Remove all statuses
  statusBadge.className = 'status-badge';
  
  if (isTrackingRunning) {
    if (data.active) {
      if (data.active.is_idle === 1) {
        statusBadge.classList.add('idle');
        statusText.innerText = 'IDLE';
        if (sidebarStatusText) sidebarStatusText.innerText = 'idle';
      } else {
        statusBadge.classList.add('active');
        statusText.innerText = 'ACTIVE';
        if (sidebarStatusText) sidebarStatusText.innerText = 'tracking';
      }
      
      // Update Hero Card details
      document.getElementById('hero-app-name').innerText = data.active.app_name;
      document.getElementById('hero-window-title').innerText = data.active.window_title || 'Active Window';
      
      resolveAppIcon(data.active.app_name, data.active.app_path, data.active.window_title).then(iconSrc => {
        const img = document.getElementById('hero-app-icon');
        if (img && iconSrc) img.src = iconSrc;
      });
      
      const elapsed = Math.floor(Date.now() / 1000) - data.active.started_at;
      document.getElementById('hero-session-duration').innerText = formatDuration(elapsed);
      document.getElementById('hero-session-since').innerText = formatTime(data.active.started_at);
    } else {
      // Ignored app state
      statusBadge.classList.add('monitoring');
      statusText.innerText = 'MONITORING';
      if (sidebarStatusText) sidebarStatusText.innerText = 'monitoring';
      
      document.getElementById('hero-app-name').innerText = '- (Ignored App)';
      document.getElementById('hero-window-title').innerText = 'You are currently focusing on an ignored process or terminal.';
      document.getElementById('hero-session-duration').innerText = '-';
      document.getElementById('hero-session-since').innerText = '-';
      
      const img = document.getElementById('hero-app-icon');
      if (img) img.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='rgba%28255,255,255,0.25%29' d='M12 2A10 10 0 0 0 2 12a10 10 0 0 0 10 10a10 10 0 0 0 10-10A10 10 0 0 0 12 2m0 2a8 8 0 0 1 8 8a8 8 0 0 1-8 8a8 8 0 0 1-8-8a8 8 0 0 1 8-8'/%3E%3C/svg%3E";
    }
  } else {
    // Offline state
    statusBadge.classList.add('offline');
    statusText.innerText = 'OFFLINE';
    if (sidebarStatusText) sidebarStatusText.innerText = 'offline';
    
    document.getElementById('hero-app-name').innerText = 'No Active Session';
    document.getElementById('hero-window-title').innerText = 'Daemon is inactive or paused. Use "Start Tracking" to resume.';
    document.getElementById('hero-session-duration').innerText = '-';
    document.getElementById('hero-session-since').innerText = '-';
    
    const img = document.getElementById('hero-app-icon');
    if (img) img.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='rgba%28255,255,255,0.25%29' d='M12 2A10 10 0 0 0 2 12a10 10 0 0 0 10 10a10 10 0 0 0 10-10A10 10 0 0 0 12 2m0 2a8 8 0 0 1 8 8a8 8 0 0 1-8 8a8 8 0 0 1-8-8a8 8 0 0 1 8-8'/%3E%3C/svg%3E";
  }

  // Update visual today charts if latest metrics payload is received
  if (data.metrics) {
    renderTodayMetrics(data.metrics);
    loadDailyRhythm();
    if (document.getElementById('tab-timeline')?.classList.contains('active')) {
      loadDailyTimeline();
    }
  }
});

// Start/Stop Tracking Toggle trigger
document.getElementById('toggleDaemonBtn').addEventListener('click', async () => {
  const isRunning = await window.api.toggleDaemon();
  loadTodayDashboard();
});

const setupForm = document.getElementById('setupForm');
if (setupForm) {
  setupForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const input = document.getElementById('setupUserName');
    const userName = normalizeDisplayName(input?.value);

    if (!userName) {
      input?.focus();
      return;
    }

    await window.api.saveConfig('user_name', userName);
    applyUserName(userName);
    document.getElementById('setupOverlay')?.classList.add('hidden');
    loadTodayDashboard();
    loadClassifications();
    loadFocusCalendar();
  });
}

// LOAD WEEKLY BREAKDOWN REPORT
async function loadWeeklyReport() {
  try {
    const weekly = await window.api.getWeeklyMetrics();
    renderWeeklyMetrics(weekly);
  } catch (err) {
    console.error('Failed to load weekly metrics:', err);
  }
}

function renderWeeklyMetrics(weekly) {
  const rangeLabel = document.getElementById('weekly-range-label');
  const scoreCardVal = document.getElementById('weekly-focus-score');
  const workCardVal = document.getElementById('weekly-active-time');
  const idleCardVal = document.getElementById('weekly-idle-time');
  const chartContainer = document.getElementById('weekly-chart-bars');
  const insightBox = document.getElementById('weekly-insight-box');
  const appsContainer = document.getElementById('weekly-top-apps');

  rangeLabel.innerText = weekly.rangeText;

  if (weekly.empty) {
    scoreCardVal.innerText = '0%';
    workCardVal.innerText = '0h 00m';
    idleCardVal.innerText = '0h 00m';
    chartContainer.innerHTML = `<div class="no-data-placeholder">No weekly activity data tracked yet.</div>`;
    renderInsightCards(insightBox, [], 'No insight data available.');
    appsContainer.innerHTML = `<div class="no-data-placeholder">No applications tracked yet this week.</div>`;
    return;
  }

  // Fill in metrics totals
  scoreCardVal.innerText = `${weekly.focusScore}%`;
  workCardVal.innerText = formatDuration(weekly.activeTime);
  idleCardVal.innerText = formatDuration(weekly.idleTime);
  renderInsightCards(insightBox, weekly.insightCards, weekly.insight);

  // Render weekly chart bars
  chartContainer.innerHTML = '';
  
  const maxActive = Math.max(...weekly.daily.map(d => d.activeTime)) || 1;

  weekly.daily.forEach(day => {
    const ratio = (day.activeTime / maxActive) * 100;
    
    let scoreColorClass = 'score-red';
    if (!day.tracked) scoreColorClass = 'score-muted';
    else if (day.focusScore >= 80) scoreColorClass = 'score-green';
    else if (day.focusScore >= 50) scoreColorClass = 'score-yellow';

    const row = document.createElement('div');
    row.className = 'weekly-bar-row';
    row.innerHTML = `
      <span class="weekly-day-label">${day.name}</span>
      <div class="weekly-bar-container">
        <div class="weekly-bar-fill ${scoreColorClass}" style="width: ${day.tracked ? ratio : 0}%"></div>
      </div>
      <span class="weekly-score-label ${scoreColorClass}">${day.tracked ? day.focusScore + '%' : 'No Data'}</span>
      <span class="weekly-duration-label">${day.tracked ? formatDuration(day.activeTime) : '-'}</span>
    `;
    chartContainer.appendChild(row);
  });

  // Render weekly top apps
  appsContainer.innerHTML = '';
  const maxWeeklyApp = weekly.apps[0]?.duration || 1;

  weekly.apps.slice(0, 5).forEach(app => {
    const ratio = (app.duration / maxWeeklyApp) * 100;
    
    let catClass = 'neutral';
    if (app.category === 'productive') catClass = 'productive';
    else if (app.category === 'distracting') catClass = 'distracting';

    const row = document.createElement('div');
    row.className = 'app-row';
    row.innerHTML = `
      <span class="app-row-name ${catClass}">${app.name}</span>
      <div class="app-row-bar-container">
        <div class="app-row-bar-fill ${catClass}" style="width: ${ratio}%"></div>
      </div>
      <span class="app-row-duration">${formatDuration(app.duration)}</span>
      <div>
        <span class="app-row-tag ${catClass}">${app.category || 'neutral'}</span>
      </div>
    `;
    appsContainer.appendChild(row);
  });
}

// CLASSIFICATIONS & CONFIGURATION INPUT PIPELINE
async function loadClassifications() {
  try {
    const config = await window.api.getConfigs();
    categoryDiagnostics = await window.api.getCategoryDiagnostics();
    classificationOptions = await window.api.getClassificationOptions();
    activeConfigs = config;
    
    renderTags('productive', config.productive);
    renderTags('distracting', config.distracting);
    renderTags('ignored', config.ignored);
    renderClassificationOptions();
    
    // Also set database tab threshold
    const thresholdInput = document.getElementById('idle_threshold');
    if (thresholdInput && config.idle_threshold) {
      thresholdInput.value = config.idle_threshold;
    }

    const profileInput = document.getElementById('profile-user-name');
    if (profileInput) {
      profileInput.value = normalizeDisplayName(config.user_name || currentUserName);
    }
  } catch (err) {
    console.error('Failed to load classifications:', err);
  }
}

function optionMatchesSearch(option, query) {
  if (!query) return true;
  const haystack = [
    option.label,
    option.value,
    option.source,
    option.browser,
    option.title
  ].filter(Boolean).join(' ').toLowerCase();
  return haystack.includes(query);
}

function renderSuggestionList(containerId, options, emptyText) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const query = (document.getElementById('classification-search')?.value || '').trim().toLowerCase();
  const filtered = options.filter(option => optionMatchesSearch(option, query)).slice(0, 80);

  container.innerHTML = '';

  if (filtered.length === 0) {
    container.innerHTML = `<div class="no-data-placeholder">${emptyText}</div>`;
    return;
  }

  for (const option of filtered) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'suggestion-row';
    row.dataset.value = option.value;
    row.innerHTML = `
      <span class="suggestion-main">
        <span class="suggestion-name">${escapeHtml(option.label)}</span>
        <span class="suggestion-meta">${escapeHtml(option.source || option.browser || 'Tracked browser title')}</span>
      </span>
      <span class="suggestion-count">${option.seenCount ? `${option.seenCount}x` : 'Add'}</span>
    `;
    row.addEventListener('click', () => {
      const targetCategory = document.getElementById('picker-target-category')?.value || 'productive';
      addTag(targetCategory, option.value);
    });
    container.appendChild(row);
  }
}

function renderClassificationOptions() {
  renderSuggestionList(
    'app-suggestions',
    classificationOptions.apps || [],
    'No matching apps found.'
  );
  renderSuggestionList(
    'browser-tab-suggestions',
    classificationOptions.browserTabs || [],
    'No matching tracked browser tabs yet.'
  );
}

// Render lists of tags in setting inputs
function renderTags(category, rawString) {
  const container = document.getElementById(`${category}-tags`);
  if (!container) return;
  container.innerHTML = '';
  
  if (!rawString || rawString.trim() === '') return;

  const tags = rawString.split(',').map(t => t.trim()).filter(t => t.length > 0);
  tags.forEach(tagText => {
    const diagnostic = categoryDiagnostics?.[category]?.[tagText];
    const statusClass = diagnostic?.broad ? 'broad' : diagnostic?.matches > 0 ? 'seen' : 'unseen';
    let statusText = 'Not seen yet';
    if (diagnostic?.broad) {
      statusText = 'Broad match';
    } else if (diagnostic?.matches > 0) {
      statusText = `Seen ${diagnostic.matches}x`;
    }

    const tag = document.createElement('div');
    tag.className = `tag ${statusClass}`;
    tag.title = diagnostic?.broad
      ? 'This entry is broad and may match unrelated app names or window titles.'
      : diagnostic?.matches > 0
        ? 'This entry has matched tracked history.'
        : 'This entry is allowed, but it has not matched any tracked app or window title yet.';
    tag.innerHTML = `
      <span>${escapeHtml(tagText)}</span>
      <span class="tag-status">${statusText}</span>
      <span class="tag-remove">&times;</span>
    `;
    
    // Add remove event listener
    tag.querySelector('.tag-remove').addEventListener('click', (e) => {
      removeTag(category, tagText);
    });

    container.appendChild(tag);
  });
}

// Helper to remove tag
async function removeTag(category, tagText) {
  const currentList = activeConfigs[category] || '';
  const updatedList = currentList
    .split(',')
    .map(t => t.trim())
    .filter(t => t.toLowerCase() !== tagText.toLowerCase() && t.length > 0)
    .join(', ');

  activeConfigs[category] = updatedList;
  await window.api.saveConfig(category, updatedList);
  categoryDiagnostics = await window.api.getCategoryDiagnostics();
  renderTags(category, updatedList);
}

// Helper to add tag
async function addTag(category, tagText) {
  if (!tagText || tagText.trim() === '') return;
  const currentList = activeConfigs[category] || '';
  
  // Check duplicates
  const listArr = currentList.split(',').map(t => t.trim().toLowerCase()).filter(t => t.length > 0);
  if (listArr.includes(tagText.trim().toLowerCase())) return;

  const separator = currentList && currentList.trim() !== '' ? ', ' : '';
  const updatedList = currentList + separator + tagText.trim();

  activeConfigs[category] = updatedList;
  await window.api.saveConfig(category, updatedList);
  categoryDiagnostics = await window.api.getCategoryDiagnostics();
  renderTags(category, updatedList);
  renderClassificationOptions();
}

const classificationSearch = document.getElementById('classification-search');
if (classificationSearch) {
  classificationSearch.addEventListener('input', renderClassificationOptions);
}

// Bind tag input field listeners (Enter keys)
const tagFields = document.querySelectorAll('.tag-input-field');
tagFields.forEach(field => {
  field.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const category = field.getAttribute('data-category');
      const val = field.value.trim();
      if (val) {
        addTag(category, val);
        field.value = '';
      }
    }
  });
});

// Configs database update buttons
document.getElementById('saveConfigBtn').addEventListener('click', async () => {
  alert('Configurations saved successfully!');
});

const saveProfileBtn = document.getElementById('saveProfileBtn');
if (saveProfileBtn) {
  saveProfileBtn.addEventListener('click', async () => {
    const input = document.getElementById('profile-user-name');
    const userName = normalizeDisplayName(input?.value);

    if (!userName) {
      input?.focus();
      return;
    }

    await window.api.saveConfig('user_name', userName);
    activeConfigs.user_name = userName;
    applyUserName(userName);
    loadTodayDashboard();
  });
}

// Update Idle Threshold Settings
document.getElementById('saveThresholdBtn').addEventListener('click', async () => {
  const thresholdVal = document.getElementById('idle_threshold').value.trim();
  const threshold = parseInt(thresholdVal, 10);
  
  if (isNaN(threshold) || threshold <= 0) {
    alert('Please enter a valid positive integer for the idle threshold.');
    return;
  }

  await window.api.saveConfig('idle_threshold', threshold.toString());
  alert(`Idle threshold updated to ${threshold} seconds.`);
});

// Purge Logs Button
document.getElementById('purgeBtn').addEventListener('click', async () => {
  const duration = document.getElementById('purge-duration').value;
  const confirmText = `Are you sure you want to delete database logs older than ${duration}? This action is irreversible.`;
  
  if (confirm(confirmText)) {
    try {
      const response = await window.api.clearLogs(duration);
      if (response.success) {
        alert(`Logs successfully cleared! Deleted rows count: ${response.changes}`);
        loadTodayDashboard();
      } else {
        alert(`Clear operation failed: ${response.error}`);
      }
    } catch (err) {
      alert(`Error during purge: ${err.message}`);
    }
  }
});

// Render GitHub-style Contributions Heatmap Grid
async function loadFocusHeatmap() {
  const container = document.getElementById('heatmap-grid-container');
  if (!container) return;
  container.innerHTML = '';
  
  try {
    const heatmapData = await window.api.getHeatmapData();
    
    // We calculate a 53-week range starting from 371 days ago aligned to Sunday
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 371);
    const dayOfWeek = startDate.getDay(); // 0 represents Sunday
    startDate.setDate(startDate.getDate() - dayOfWeek); // Go back to start on Sunday of that week

    const todayObj = new Date();
    const rangeLabel = document.getElementById('heatmap-range-label');
    if (rangeLabel) {
      const startLabel = startDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
      const endLabel = todayObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
      rangeLabel.innerText = `Daily focus scores from ${startLabel} to ${endLabel}`;
    }
    
    const todayStr = new Date().toISOString().split('T')[0];
    
    let currentStreak = 0;
    let maxStreak = 0;
    let tempStreak = 0;
    
    // Create cells column by column (week by week)
    for (let col = 0; col < 53; col++) {
      for (let row = 0; row < 7; row++) {
        const cellDate = new Date(startDate.getTime());
        cellDate.setDate(startDate.getDate() + (col * 7) + row);
        
        // Skip dates in the future
        if (cellDate > todayObj) continue;
        
        const yyyy = cellDate.getFullYear();
        const mm = String(cellDate.getMonth() + 1).padStart(2, '0');
        const dd = String(cellDate.getDate()).padStart(2, '0');
        const dateStr = `${yyyy}-${mm}-${dd}`;
        
        const record = heatmapData[dateStr];
        const score = record ? record.score : 0;
        const activeTime = record ? record.activeTime : 0;
        
        // Decide color levels
        let level = 0;
        if (activeTime > 0) {
          if (score < 40) level = 1;
          else if (score < 65) level = 2;
          else if (score < 80) level = 3;
          else level = 4;
        }
        
        // Tooltip detail
        const dateLabel = cellDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
        let tooltip = `${dateLabel}: No focus activity tracked`;
        if (activeTime > 0) {
          tooltip = `${dateLabel}: Focus Score ${score}% (Productive: ${formatDuration(record.productiveTime)}, Active: ${formatDuration(activeTime)})`;
        }
        
        const cell = document.createElement('div');
        cell.className = `heatmap-cell level-${level}`;
        cell.title = tooltip;
        
        container.appendChild(cell);
      }
    }

    const heatmapScroller = container.closest('.heatmap-container-outer');
    if (heatmapScroller) {
      heatmapScroller.scrollLeft = heatmapScroller.scrollWidth;
    }
    
    // Streak calculations: loop day-by-day from 371 days ago to today
    const streakStart = new Date(startDate.getTime());
    
    let tempDate = new Date(streakStart.getTime());
    
    while (tempDate <= todayObj) {
      const yyyy = tempDate.getFullYear();
      const mm = String(tempDate.getMonth() + 1).padStart(2, '0');
      const dd = String(tempDate.getDate()).padStart(2, '0');
      const dateStr = `${yyyy}-${mm}-${dd}`;
      
      const record = heatmapData[dateStr];
      const hasProductiveDay = record && record.score >= 50 && record.activeTime >= 300; // >= 5 mins & Focus >= 50%
      
      if (hasProductiveDay) {
        tempStreak++;
        if (tempStreak > maxStreak) {
          maxStreak = tempStreak;
        }
      } else {
        // Only break current streak if this day has passed (e.g. yesterday or older).
        // If it is today and they haven't worked yet, we don't break the current streak immediately.
        if (dateStr !== todayStr) {
          tempStreak = 0;
        }
      }
      
      tempDate.setDate(tempDate.getDate() + 1);
    }
    
    currentStreak = tempStreak;
    
    // Set streak footer text
    const streakFooter = document.getElementById('heatmap-streak-info');
    if (streakFooter) {
      streakFooter.innerText = `🔥 Current Focus Streak: ${currentStreak} day${currentStreak === 1 ? '' : 's'} · Max Streak: ${maxStreak} day${maxStreak === 1 ? '' : 's'}`;
    }
    
    const dashCurrent = document.getElementById('dash-current-streak');
    if (dashCurrent) {
      dashCurrent.innerText = currentStreak;
    }
    
    const dashLongest = document.getElementById('dash-longest-streak-tip');
    if (dashLongest) {
      dashLongest.innerText = `Longest streak: ${maxStreak} day${maxStreak === 1 ? '' : 's'}`;
    }
    
  } catch (err) {
    console.error('Failed to populate focus heatmap:', err);
  }
}

let calendarControlsBound = false;

function toDateInputValue(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function parseDateInputValue(value) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addCalendarDays(date, amount) {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + amount);
  return next;
}

function getCalendarLevel(record) {
  if (!record || record.activeTime <= 0) return 0;
  if (record.score < 40) return 1;
  if (record.score < 65) return 2;
  if (record.score < 80) return 3;
  return 4;
}

function buildCalendarMonths(fromDate, toDate) {
  const months = [];
  const cursor = new Date(fromDate.getFullYear(), fromDate.getMonth(), 1);
  const endMonth = new Date(toDate.getFullYear(), toDate.getMonth(), 1);

  while (cursor <= endMonth) {
    months.push(new Date(cursor.getTime()));
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return months;
}

function updateCalendarStreaks(heatmapData, fromDate, toDate) {
  let tempStreak = 0;
  let maxStreak = 0;
  const todayStr = toDateInputValue(new Date());

  for (let cursor = new Date(fromDate.getTime()); cursor <= toDate; cursor = addCalendarDays(cursor, 1)) {
    const dateStr = toDateInputValue(cursor);
    const record = heatmapData[dateStr];
    const hasProductiveDay = record && record.score >= 50 && record.activeTime >= 300;

    if (hasProductiveDay) {
      tempStreak++;
      maxStreak = Math.max(maxStreak, tempStreak);
    } else if (dateStr !== todayStr) {
      tempStreak = 0;
    }
  }

  const streakFooter = document.getElementById('heatmap-streak-info');
  if (streakFooter) {
    streakFooter.innerText = `Range focus streak: ${tempStreak} day${tempStreak === 1 ? '' : 's'} · Best streak: ${maxStreak} day${maxStreak === 1 ? '' : 's'}`;
  }

  const dashCurrent = document.getElementById('dash-current-streak');
  if (dashCurrent) dashCurrent.innerText = tempStreak;

  const dashLongest = document.getElementById('dash-longest-streak-tip');
  if (dashLongest) dashLongest.innerText = `Longest streak: ${maxStreak} day${maxStreak === 1 ? '' : 's'}`;
}

function renderFocusCalendar(heatmapData, fromDate, toDate) {
  const container = document.getElementById('heatmap-grid-container');
  if (!container) return;

  container.innerHTML = '';
  const leadingBlanks = fromDate.getDay();
  const rangeDays = Math.floor((toDate - fromDate) / (24 * 60 * 60 * 1000)) + 1;
  const weekCount = Math.ceil((leadingBlanks + rangeDays) / 7);

  const shell = document.createElement('div');
  shell.className = 'contribution-calendar';
  shell.innerHTML = `
    <div class="calendar-month-labels"></div>
    <div class="calendar-contribution-body">
      <div class="calendar-row-labels">
        <span></span><span>Mon</span><span></span><span>Wed</span><span></span><span>Fri</span><span></span>
      </div>
      <div class="calendar-contrib-grid"></div>
    </div>
  `;

  const monthLabels = shell.querySelector('.calendar-month-labels');
  const grid = shell.querySelector('.calendar-contrib-grid');
  let lastMonth = null;
  let lastLabeledWeek = -4;

  for (let week = 0; week < weekCount; week++) {
    const label = document.createElement('span');
    const firstDayIndexInColumn = Math.max(week * 7 - leadingBlanks, 0);
    const labelDate = addCalendarDays(fromDate, firstDayIndexInColumn);
    const shouldShowMonth = labelDate <= toDate &&
      (week === 0 || labelDate.getMonth() !== lastMonth) &&
      (week - lastLabeledWeek >= 3);

    label.innerText = shouldShowMonth
      ? labelDate.toLocaleDateString(undefined, { month: 'short' })
      : '';
    monthLabels.appendChild(label);
    if (shouldShowMonth) {
      lastMonth = labelDate.getMonth();
      lastLabeledWeek = week;
    }

    for (let row = 0; row < 7; row++) {
      const dayIndex = week * 7 + row - leadingBlanks;
      if (dayIndex < 0 || dayIndex >= rangeDays) {
        const blank = document.createElement('span');
        blank.className = 'heatmap-cell blank';
        grid.appendChild(blank);
        continue;
      }

      const cellDate = addCalendarDays(fromDate, dayIndex);
      const dateStr = toDateInputValue(cellDate);
      const record = heatmapData[dateStr];
      const level = getCalendarLevel(record);
      const dateLabel = cellDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
      const tooltip = record && record.activeTime > 0
        ? `${dateLabel}: Focus Score ${record.score}% (Productive: ${formatDuration(record.productiveTime)}, Active: ${formatDuration(record.activeTime)})`
        : `${dateLabel}: No focus activity tracked`;

      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = `heatmap-cell level-${level}`;
      cell.title = tooltip;
      cell.setAttribute('aria-label', tooltip);
      grid.appendChild(cell);
    }
  }

  container.appendChild(shell);
}

function ensureCalendarControls() {
  const fromInput = document.getElementById('calendar-date-from');
  const toInput = document.getElementById('calendar-date-to');
  const applyBtn = document.getElementById('calendar-apply-btn');
  if (!fromInput || !toInput || !applyBtn) return null;

  if (!fromInput.value || !toInput.value) {
    const today = new Date();
    const from = new Date(today.getFullYear(), today.getMonth(), 1);
    fromInput.value = toDateInputValue(from);
    toInput.value = toDateInputValue(today);
  }

  if (!calendarControlsBound) {
    const reload = () => loadFocusCalendar();
    applyBtn.addEventListener('click', reload);
    fromInput.addEventListener('change', reload);
    toInput.addEventListener('change', reload);
    calendarControlsBound = true;
  }

  return { fromInput, toInput };
}

async function loadFocusCalendar() {
  const controls = ensureCalendarControls();
  if (!controls) return;

  let fromDate = parseDateInputValue(controls.fromInput.value);
  let toDate = parseDateInputValue(controls.toInput.value);
  if (!fromDate || !toDate) return;

  if (fromDate > toDate) {
    [fromDate, toDate] = [toDate, fromDate];
    controls.fromInput.value = toDateInputValue(fromDate);
    controls.toInput.value = toDateInputValue(toDate);
  }

  try {
    const heatmapData = await window.api.getHeatmapData({
      from: toDateInputValue(fromDate),
      to: toDateInputValue(toDate)
    });

    const rangeLabel = document.getElementById('heatmap-range-label');
    if (rangeLabel) {
      const startLabel = fromDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
      const endLabel = toDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
      rangeLabel.innerText = `Daily focus scores from ${startLabel} to ${endLabel}`;
    }

    renderFocusCalendar(heatmapData, fromDate, toDate);
    updateCalendarStreaks(heatmapData, fromDate, toDate);
  } catch (err) {
    console.error('Failed to populate focus calendar:', err);
  }
}

// App Initialize Bootstrap
document.addEventListener('DOMContentLoaded', async () => {
  const configs = await loadUserProfile();
  const setupComplete = await ensureSetupComplete(configs);
  if (!setupComplete) return;

  loadTodayDashboard();
  loadClassifications();
  loadFocusCalendar();
});
