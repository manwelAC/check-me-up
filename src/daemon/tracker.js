import activeWin from 'active-win';
import realIdle from '@paymoapp/real-idle';
import fs from 'fs';
import { initDB, LOG_PATH } from '../db/schema.js';
import { getActiveSession, closeSession, createSession, closeAllOpenSessions } from '../db/queries.js';
import { getConfig, isIgnoredApp } from '../config/index.js';

// Setup native file logging since daemon is spawned detached
const logStream = fs.createWriteStream(LOG_PATH, { flags: 'a' });
const originalLog = console.log;
const originalError = console.error;

console.log = function(...args) {
  const msg = `[${new Date().toISOString()}] [INFO] ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ')}\n`;
  logStream.write(msg);
  // Also write to stdout if available (for manual runs)
  if (process.stdout.writable) {
    originalLog(...args);
  }
};

console.error = function(...args) {
  const msg = `[${new Date().toISOString()}] [ERROR] ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ')}\n`;
  logStream.write(msg);
  // Also write to stderr if available (for manual runs)
  if (process.stderr.writable) {
    originalError(...args);
  }
};

const POLL_INTERVAL_MS = 5000;
let lastTickTime = Math.floor(Date.now() / 1000);

async function tick() {
  const now = Math.floor(Date.now() / 1000);
  console.log(`[${new Date().toISOString()}] Tick starting...`);
  
  // Detect system suspend / huge gaps (e.g., system sleep)
  const gap = now - lastTickTime;
  const isResume = gap > (POLL_INTERVAL_MS / 1000) * 3; // > 15 seconds gap
  
  lastTickTime = now;

  try {
    // 1. Get configuration
    console.log(`[${new Date().toISOString()}] Getting config...`);
    const thresholdVal = getConfig('idle_threshold') || '60';
    const idleThreshold = parseInt(thresholdVal, 10) || 60;
    console.log(`[${new Date().toISOString()}] Config: idle_threshold = ${idleThreshold}`);

    // 2. Get idle state
    console.log(`[${new Date().toISOString()}] Getting idle seconds...`);
    let idleSeconds = 0;
    try {
      idleSeconds = realIdle.getIdleSeconds();
      console.log(`[${new Date().toISOString()}] Idle seconds = ${idleSeconds}`);
    } catch (e) {
      console.error('Failed to get idle seconds:', e);
    }
    const isIdle = idleSeconds >= idleThreshold;

    // 3. Get active window
    let appName = 'Idle';
    let windowTitle = 'Idle';
    let appPath = null;

    if (!isIdle) {
      console.log(`[${new Date().toISOString()}] Getting active window...`);
      try {
        const win = await activeWin();
        console.log(`[${new Date().toISOString()}] Active window:`, win ? `${win.owner?.name} - ${win.title}` : 'None');
        if (win) {
          appName = win.owner?.name || win.name || 'Unknown';
          windowTitle = win.title || 'Unknown';
          appPath = win.owner?.path || null;
        } else {
          appName = 'Unknown';
          windowTitle = 'Unknown';
        }
      } catch (e) {
        console.error('Active window retrieval failed:', e);
        appName = 'Unknown';
        windowTitle = 'Unknown';
      }
    } else {
      console.log(`[${new Date().toISOString()}] System is idle.`);
    }

    // Check if the current app is in the ignored list
    const isIgnored = isIgnoredApp(appName, windowTitle, isIdle);

    if (isIgnored) {
      console.log(`[${new Date().toISOString()}] App "${appName}" is in ignored list.`);
      const activeSession = getActiveSession();
      if (activeSession) {
        console.log(`[${new Date().toISOString()}] Closing active session (ID: ${activeSession.id}) due to exclusion.`);
        closeSession(activeSession.id, now);
      }
      console.log(`[${new Date().toISOString()}] Skipping tracking for ignored app.`);
      console.log(`[${new Date().toISOString()}] Tick complete.`);
      return;
    }

    // 4. Update Database
    console.log(`[${new Date().toISOString()}] Updating database...`);
    let activeSession = getActiveSession();
    console.log(`[${new Date().toISOString()}] Active session in DB:`, activeSession ? `id=${activeSession.id}, app=${activeSession.app_name}` : 'None');

    // If system was suspended or has a huge gap, close the previous session at the last tick time
    if (isResume && activeSession) {
      console.log(`[${new Date().toISOString()}] System resumed. Closing old session.`);
      closeSession(activeSession.id, now - gap + 5);
      activeSession = null;
    }

    if (!activeSession) {
      console.log(`[${new Date().toISOString()}] Starting new session: ${appName}`);
      createSession(appName, windowTitle, now, isIdle ? 1 : 0, appPath);
    } else {
      const stateChanged = 
        activeSession.app_name !== appName ||
        activeSession.window_title !== windowTitle ||
        activeSession.is_idle !== (isIdle ? 1 : 0);

      if (stateChanged) {
        console.log(`[${new Date().toISOString()}] State changed from ${activeSession.app_name} to ${appName}. Closing old and starting new.`);
        closeSession(activeSession.id, now);
        createSession(appName, windowTitle, now, isIdle ? 1 : 0, appPath);
      } else {
        console.log(`[${new Date().toISOString()}] State unchanged.`);
      }
    }
    console.log(`[${new Date().toISOString()}] Tick complete.`);
  } catch (error) {
    console.error('Error in tracker loop:', error);
  }
}

// Startup Initialization
function startTracker() {
  console.log(`[${new Date().toISOString()}] Tracker starting...`);
  
  // Ensure DB initialized
  initDB();
  
  // Close any orphaned active sessions left open from previous runs
  closeAllOpenSessions(Math.floor(Date.now() / 1000));
  
  // Start polling
  tick(); // run first tick immediately
  setInterval(tick, POLL_INTERVAL_MS);
}

startTracker();
