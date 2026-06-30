import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } from 'electron';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDB } from '../db/schema.js';
import { getActiveSession, getSessionsForPeriod, clearSessionsOlderThan, getAllSessionsForExport } from '../db/queries.js';
import { getDayTimestamps } from '../report/daily.js';
import { calculateMetrics, extractSiteName, getDisplayAppName, getSessionCategory } from '../report/renderer.js';
import { getWeeklyMetrics } from '../report/weekly.js';
import { getAllConfig, setConfig, isIgnoredApp } from '../config/index.js';
import { isRunning, startDaemon, stopDaemon } from '../daemon/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_ICON_PATH = path.join(__dirname, '../assets/check-me-up-logo.ico');
const APP_TRAY_ICON_PATH = path.join(__dirname, '../assets/check-me-up-logo-16.png');
const ELECTRON_USER_DATA_DIR = path.join(os.homedir(), '.check-me', 'electron');

fs.mkdirSync(ELECTRON_USER_DATA_DIR, { recursive: true });
app.setPath('userData', ELECTRON_USER_DATA_DIR);
app.commandLine.appendSwitch('disk-cache-dir', path.join(ELECTRON_USER_DATA_DIR, 'Cache'));
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');

if (process.platform === 'win32') {
  app.setAppUserModelId('com.manwelac.checkmeup');
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.exit(0);
  process.exit(0);
}

// Enable live hot-reloading using native fs.watch (ESM compatible)
if (!app.isPackaged) {
  const watchPath = path.join(__dirname, '..');
  let reloadTimeout;
  fs.watch(watchPath, { recursive: true }, (eventType, filename) => {
    if (filename) {
      clearTimeout(reloadTimeout);
      reloadTimeout = setTimeout(() => {
        console.log(`[check-me] File changed: ${filename}`);
        if (filename.includes('renderer') || filename.endsWith('.html') || filename.endsWith('.css')) {
          if (mainWindow && !mainWindow.isDestroyed()) {
            console.log('[check-me] Reloading GUI window...');
            mainWindow.webContents.reloadIgnoringCache();
          }
        } else {
          console.log('[check-me] Backend file changed. Relaunching app...');
          app.relaunch();
          app.exit(0);
        }
      }, 200);
    }
  });
}

let mainWindow = null;
let tray = null;
let isQuitting = false;

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.show();
  mainWindow.focus();
}

function isBrowserApp(appName = '') {
  const appLower = appName.toLowerCase();
  return appLower.includes('chrome') ||
    appLower.includes('brave') ||
    appLower.includes('firefox') ||
    appLower.includes('safari') ||
    appLower.includes('edge') ||
    appLower.includes('opera') ||
    appLower.includes('yandex') ||
    appLower.includes('internet explorer') ||
    (appLower.includes('browser') && !appLower.includes('windows'));
}

function cleanAppName(name) {
  return (name || '')
    .replace(/\.(lnk|exe)$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function addDiscoveredApp(apps, name, source, appPath = null, seenCount = 0) {
  const cleanName = cleanAppName(name);
  if (!cleanName || cleanName.length < 2) return;
  const ignoredNames = new Set(['uninstall', 'setup', 'installer', 'update', 'helper', 'crashpad_handler']);
  if (ignoredNames.has(cleanName.toLowerCase())) return;

  const key = cleanName.toLowerCase();
  const existing = apps.get(key);
  if (!existing || seenCount > existing.seenCount || (appPath && !existing.path)) {
    apps.set(key, {
      label: cleanName,
      value: cleanName,
      source,
      path: appPath || existing?.path || null,
      seenCount: Math.max(seenCount, existing?.seenCount || 0),
      browser: isBrowserApp(cleanName)
    });
  }
}

function walkFiles(root, predicate, limit = 500) {
  const results = [];
  const stack = [root];

  while (stack.length > 0 && results.length < limit) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch (_) {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (predicate(entry.name, fullPath)) {
        results.push(fullPath);
        if (results.length >= limit) break;
      }
    }
  }

  return results;
}

function getWindowsApplicationSuggestions() {
  if (process.platform !== 'win32') return [];

  const apps = new Map();
  const startMenuRoots = [
    process.env.ProgramData ? path.join(process.env.ProgramData, 'Microsoft\\Windows\\Start Menu\\Programs') : 'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs',
    process.env.APPDATA ? path.join(process.env.APPDATA, 'Microsoft\\Windows\\Start Menu\\Programs') : null
  ].filter(Boolean);

  for (const root of startMenuRoots) {
    const shortcuts = walkFiles(root, name => name.toLowerCase().endsWith('.lnk'), 800);
    for (const shortcut of shortcuts) {
      addDiscoveredApp(apps, path.basename(shortcut), 'Windows apps', shortcut);
    }
  }

  const programRoots = [
    process.env.ProgramFiles,
    process.env['ProgramFiles(x86)'],
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Programs') : null
  ].filter(Boolean);

  for (const root of programRoots) {
    const executables = walkFiles(root, name => name.toLowerCase().endsWith('.exe'), 1200);
    for (const exePath of executables) {
      addDiscoveredApp(apps, path.basename(exePath), 'Installed executables', exePath);
    }
  }

  return Array.from(apps.values());
}

function getHistoryApplicationSuggestions(sessions) {
  const apps = new Map();

  for (const session of sessions) {
    if (!session || session.is_idle === 1 || !session.app_name) continue;
    const key = cleanAppName(session.app_name).toLowerCase();
    const existing = apps.get(key);
    addDiscoveredApp(apps, session.app_name, 'Tracked history', session.app_path, (existing?.seenCount || 0) + 1);
  }

  return Array.from(apps.values());
}

function getBrowserTabSuggestions(sessions) {
  const tabs = new Map();

  for (const session of sessions) {
    if (!session || session.is_idle === 1 || !session.window_title || !isBrowserApp(session.app_name)) continue;

    const siteName = extractSiteName(session.window_title);
    const value = siteName && siteName !== 'Other' ? siteName : session.window_title;
    const key = `${session.app_name.toLowerCase()}::${value.toLowerCase()}`;
    const existing = tabs.get(key);

    tabs.set(key, {
      label: getDisplayAppName(session.app_name, session.window_title),
      value,
      browser: session.app_name,
      title: session.window_title,
      seenCount: (existing?.seenCount || 0) + 1
    });
  }

  return Array.from(tabs.values()).sort((a, b) => b.seenCount - a.seenCount);
}

// Initialize Database
console.log('[check-me] Initializing SQLite database...');
initDB();
console.log('[check-me] Database initialized.');

function createWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    showMainWindow();
    return mainWindow;
  }

  mainWindow = new BrowserWindow({
    width: 980,
    height: 700,
    minWidth: 850,
    minHeight: 600,
    backgroundColor: '#0b0b0f',
    show: false,
    frame: false, // Custom styled frameless window
    icon: APP_ICON_PATH,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  mainWindow.once('ready-to-show', () => {
    console.log('[check-me] GUI ready to show. Displaying window...');
    mainWindow.show();
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

function createTray() {
  const image = nativeImage.createFromPath(APP_TRAY_ICON_PATH);
  
  tray = new Tray(image);
  tray.setToolTip('check-me-up Focus Tracker');

  tray.on('double-click', () => {
    showMainWindow();
  });

  updateTrayMenu();
}

function updateTrayMenu() {
  if (!tray) return;
  const running = isRunning();
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Dashboard',
      click: () => {
        showMainWindow();
      }
    },
    { type: 'separator' },
    {
      label: running ? '● Tracking Active' : 'Start Tracking',
      enabled: !running,
      click: () => {
        startDaemon();
        updateTrayMenu();
      }
    },
    {
      label: !running ? '○ Tracking Stopped' : 'Stop Tracking',
      enabled: running,
      click: () => {
        stopDaemon();
        updateTrayMenu();
      }
    },
    { type: 'separator' },
    {
      label: 'Exit check-me',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);
  tray.setContextMenu(contextMenu);
}

app.whenReady().then(() => {
  createWindow();
  createTray();

  // Periodically send daemon updates to UI for live dashboard ticks
  setInterval(() => {
    if (mainWindow && mainWindow.webContents) {
      const running = isRunning();
      const active = getActiveSession();
      
      // Calculate today's metrics
      const { start, end } = getDayTimestamps();
      const sessions = getSessionsForPeriod(start, end);
      const metrics = calculateMetrics(sessions);

      mainWindow.webContents.send('tracker-tick', {
        running,
        active,
        metrics
      });
    }
  }, 2000);

  app.on('activate', () => {
    showMainWindow();
  });
});

app.on('second-instance', () => {
  showMainWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // App keeps running in the system tray
  }
});

// IPC Handler Registrations
ipcMain.handle('get-today-metrics', () => {
  const { start, end } = getDayTimestamps();
  const sessions = getSessionsForPeriod(start, end);
  return calculateMetrics(sessions);
});

function getTodayTimelineSessions() {
  const now = Math.floor(Date.now() / 1000);
  const { start, end } = getDayTimestamps();
  const sessions = getSessionsForPeriod(start, end);
  const configs = getAllConfig();
  const productiveList = (configs.productive || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const distractingList = (configs.distracting || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

  return sessions
    .map(session => {
      const startedAt = Math.max(session.started_at, start);
      const endedAt = Math.min(session.ended_at || now, end);
      const duration = Math.max(0, endedAt - startedAt);
      if (duration <= 0) return null;

      if (session.is_idle === 0 && isIgnoredApp(session.app_name, session.window_title, false)) {
        return null;
      }

      const category = session.is_idle === 1
        ? 'idle'
        : getSessionCategory(session.app_name, session.window_title, productiveList, distractingList);

      return {
        appName: session.is_idle === 1 ? 'Idle' : getDisplayAppName(session.app_name, session.window_title),
        windowTitle: session.is_idle === 1 ? 'Walk away / inactive' : (session.window_title || ''),
        category,
        startedAt,
        endedAt,
        duration,
        active: !session.ended_at
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.startedAt - b.startedAt);
}

ipcMain.handle('get-today-timeline', () => {
  return getTodayTimelineSessions();
});

ipcMain.handle('get-today-rhythm', () => {
  const timeline = getTodayTimelineSessions();
  const activeSessions = timeline.filter(session => session.category !== 'idle');

  if (activeSessions.length === 0) {
    return {
      empty: true,
      firstActivity: null,
      lastActivity: null,
      activeSpan: 0,
      mostActiveHour: null,
      mostActiveHourDuration: 0
    };
  }

  const firstActivity = activeSessions[0].startedAt;
  const lastActivity = Math.max(...activeSessions.map(session => session.endedAt));
  const hourlyActive = Array(24).fill(0);

  for (const session of activeSessions) {
    let cursor = session.startedAt;
    while (cursor < session.endedAt) {
      const cursorDate = new Date(cursor * 1000);
      const hour = cursorDate.getHours();
      const nextHour = new Date(cursorDate);
      nextHour.setHours(hour + 1, 0, 0, 0);
      const chunkEnd = Math.min(session.endedAt, Math.floor(nextHour.getTime() / 1000));
      hourlyActive[hour] += Math.max(0, chunkEnd - cursor);
      cursor = chunkEnd;
    }
  }

  let mostActiveHour = 0;
  let mostActiveHourDuration = 0;
  for (let hour = 0; hour < hourlyActive.length; hour++) {
    if (hourlyActive[hour] > mostActiveHourDuration) {
      mostActiveHour = hour;
      mostActiveHourDuration = hourlyActive[hour];
    }
  }

  return {
    empty: false,
    firstActivity,
    lastActivity,
    activeSpan: Math.max(0, lastActivity - firstActivity),
    mostActiveHour,
    mostActiveHourDuration
  };
});

ipcMain.handle('get-weekly-metrics', () => {
  return getWeeklyMetrics();
});

ipcMain.handle('get-configs', () => {
  return getAllConfig();
});

ipcMain.handle('get-category-diagnostics', () => {
  const configs = getAllConfig();
  const sessions = getAllSessionsForExport();
  const categories = ['productive', 'distracting', 'ignored'];
  const broadTerms = new Set([
    'app', 'web', 'site', 'browser', 'window', 'tab', 'home', 'new',
    'code', 'term', 'terminal', 'cmd', 'shell', 'work', 'video'
  ]);

  const diagnostics = {};

  for (const category of categories) {
    diagnostics[category] = {};
    const entries = (configs[category] || '')
      .split(',')
      .map(item => item.trim())
      .filter(Boolean);

    for (const entry of entries) {
      const normalized = entry.toLowerCase();
      const matches = sessions.filter(session => {
        if (!session || session.is_idle === 1) return false;
        const appName = (session.app_name || '').toLowerCase();
        const title = (session.window_title || '').toLowerCase();
        return appName.includes(normalized) || title.includes(normalized);
      });

      diagnostics[category][entry] = {
        matches: matches.length,
        lastSeenAt: matches.length ? Math.max(...matches.map(session => session.started_at || 0)) : null,
        broad: normalized.length < 4 || broadTerms.has(normalized)
      };
    }
  }

  return diagnostics;
});

ipcMain.handle('get-classification-options', () => {
  const sessions = getAllSessionsForExport();
  const apps = new Map();

  for (const suggestion of getWindowsApplicationSuggestions()) {
    apps.set(suggestion.label.toLowerCase(), suggestion);
  }

  for (const suggestion of getHistoryApplicationSuggestions(sessions)) {
    const key = suggestion.label.toLowerCase();
    const existing = apps.get(key);
    if (!existing || suggestion.seenCount > existing.seenCount) {
      apps.set(key, suggestion);
    } else {
      existing.seenCount = Math.max(existing.seenCount || 0, suggestion.seenCount || 0);
      existing.path = existing.path || suggestion.path;
      existing.browser = existing.browser || suggestion.browser;
    }
  }

  return {
    apps: Array.from(apps.values())
      .sort((a, b) => {
        if ((b.seenCount || 0) !== (a.seenCount || 0)) return (b.seenCount || 0) - (a.seenCount || 0);
        return a.label.localeCompare(b.label);
      })
      .slice(0, 500),
    browserTabs: getBrowserTabSuggestions(sessions).slice(0, 250)
  };
});

ipcMain.handle('save-config', (event, key, value) => {
  setConfig(key, value);
  return { success: true };
});

ipcMain.handle('clear-logs', (event, beforeDuration) => {
  const match = beforeDuration.match(/^(\d+)([dhm])$/);
  if (!match) return { success: false, error: 'Invalid duration format' };
  
  const val = parseInt(match[1], 10);
  const unit = match[2];
  let seconds = 0;
  if (unit === 'd') seconds = val * 24 * 60 * 60;
  else if (unit === 'h') seconds = val * 60 * 60;
  else if (unit === 'm') seconds = val * 60;
  
  const cutoffTimestamp = Math.floor(Date.now() / 1000) - seconds;
  const result = clearSessionsOlderThan(cutoffTimestamp);
  return { success: true, changes: result.changes };
});

ipcMain.handle('get-daemon-status', () => {
  return isRunning();
});

ipcMain.handle('toggle-daemon', () => {
  const running = isRunning();
  if (running) {
    stopDaemon();
  } else {
    startDaemon();
  }
  updateTrayMenu();
  return isRunning();
});

ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on('window-close', () => {
  if (mainWindow) mainWindow.close(); // Triggers the close intercept and hides to tray
});

const iconCache = {};
ipcMain.handle('get-app-icon', async (event, appPath) => {
  if (!appPath) return null;
  if (iconCache[appPath]) return iconCache[appPath];
  try {
    const icon = await app.getFileIcon(appPath, { size: 'normal' });
    const dataUrl = icon.toDataURL();
    iconCache[appPath] = dataUrl;
    return dataUrl;
  } catch (err) {
    return null;
  }
});

function parseLocalDateRange(range = {}) {
  const now = new Date();
  const fallbackTo = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const fallbackFrom = new Date(fallbackTo);
  fallbackFrom.setDate(fallbackFrom.getDate() - 30);
  fallbackFrom.setHours(0, 0, 0, 0);

  const parseDate = (value, endOfDay = false) => {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    if (Number.isNaN(date.getTime())) return null;
    date.setHours(endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
    return date;
  };

  let fromDate = parseDate(range.from, false) || fallbackFrom;
  let toDate = parseDate(range.to, true) || fallbackTo;

  if (fromDate > toDate) {
    [fromDate, toDate] = [
      new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate(), 0, 0, 0, 0),
      new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate(), 23, 59, 59, 999)
    ];
  }

  return {
    fromDate,
    toDate,
    startTimestamp: Math.floor(fromDate.getTime() / 1000),
    endTimestamp: Math.floor(toDate.getTime() / 1000)
  };
}

ipcMain.handle('get-heatmap-data', (event, range = {}) => {
  const { fromDate, toDate, startTimestamp, endTimestamp } = parseLocalDateRange(range);
  const now = Math.floor(Date.now() / 1000);
  
  const sessions = getSessionsForPeriod(startTimestamp, endTimestamp);
  const configs = getAllConfig();
  const productiveList = (configs.productive || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const distractingList = (configs.distracting || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  
  const dailyData = {};
  
  for (const s of sessions) {
    if (s.is_idle === 1) continue; // Skip idle
    if (isIgnoredApp(s.app_name, s.window_title, false)) continue;
    
    const startTime = s.started_at;
    const endTime = Math.min(s.ended_at || now, endTimestamp);
    const duration = endTime - startTime;
    if (duration <= 0) continue;
    
    // Convert started_at to local date string (YYYY-MM-DD)
    const dateObj = new Date(startTime * 1000);
    if (dateObj < fromDate || dateObj > toDate) continue;

    const yyyy = dateObj.getFullYear();
    const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
    const dd = String(dateObj.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;
    
    if (!dailyData[dateStr]) {
      dailyData[dateStr] = { productive: 0, distracting: 0, active: 0 };
    }
    
    const cat = getSessionCategory(s.app_name, s.window_title, productiveList, distractingList);
    dailyData[dateStr].active += duration;
    if (cat === 'productive') {
      dailyData[dateStr].productive += duration;
    } else if (cat === 'distracting') {
      dailyData[dateStr].distracting += duration;
    }
  }
  
  // Calculate final focus scores for each day
  const heatmap = {};
  for (const dateStr in dailyData) {
    const day = dailyData[dateStr];
    const score = day.active > 0 ? Math.round((day.productive / day.active) * 100) : 0;
    heatmap[dateStr] = {
      score,
      activeTime: day.active,
      productiveTime: day.productive,
      distractingTime: day.distracting
    };
  }
  
  return heatmap;
});
