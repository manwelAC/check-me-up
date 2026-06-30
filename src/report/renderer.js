import chalk from 'chalk';
import { getConfigAppList, isIgnoredApp } from '../config/index.js';

/**
 * Format seconds to a string like "2h 28m"
 */
export function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return '0h 00m';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${String(minutes).padStart(2, '0')}m`;
}

/**
 * Format a Unix timestamp to a local time string like "10:02 AM"
 */
export function formatTime(unixTimestamp) {
  const date = new Date(unixTimestamp * 1000);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Render a visual progress bar (e.g., ████████░░)
 */
export function drawBar(ratio, size = 10) {
  const filledSize = Math.round(Math.max(0, Math.min(1, ratio)) * size);
  const emptySize = size - filledSize;
  return '█'.repeat(filledSize) + '░'.repeat(emptySize);
}

/**
 * Classify a session based on app name and window title
 */
export function getSessionCategory(appName, windowTitle, productiveList, distractingList) {
  const appLower = appName.toLowerCase();
  const titleLower = (windowTitle || '').toLowerCase();

  // Check distracting first
  const isDistracting = distractingList.some(item => 
    appLower.includes(item) || titleLower.includes(item)
  );
  if (isDistracting) return 'distracting';

  // Check productive
  const isProductive = productiveList.some(item => 
    appLower.includes(item) || titleLower.includes(item)
  );
  if (isProductive) return 'productive';

  return 'neutral';
}

/**
 * Dynamically extract a site or brand name from a browser window title.
 * Splits titles by common separators (e.g. " - ", " | ") and decides the brand
 * using heuristics (relative length, common prefix brands, etc.).
 */
export function extractSiteName(windowTitle) {
  if (!windowTitle) return 'Other';
  
  // 1. Strip browser suffixes at the end if present
  let cleanTitle = windowTitle.replace(/\s*-\s*(Google Chrome|Brave|Firefox|Safari|Microsoft Edge|Edge|Internet Explorer|Opera|Yandex Browser|Yandex)$/i, '').trim();
  cleanTitle = cleanTitle
    .replace(/^\(?\d+\)?\s+/, '')
    .replace(/^[-–—•·\s]+/, '')
    .replace(/\s+/g, ' ')
    .trim();

  const knownSites = [
    { keys: ['youtube', 'youtu.be'], label: 'YouTube' },
    { keys: ['reddit'], label: 'Reddit' },
    { keys: ['facebook', 'fb.com'], label: 'Facebook' },
    { keys: ['twitter', 'x.com'], label: 'Twitter' },
    { keys: ['tiktok'], label: 'TikTok' },
    { keys: ['instagram'], label: 'Instagram' },
    { keys: ['linkedin'], label: 'LinkedIn' },
    { keys: ['netflix'], label: 'Netflix' },
    { keys: ['twitch'], label: 'Twitch' },
    { keys: ['gmail'], label: 'Gmail' },
    { keys: ['outlook'], label: 'Outlook' },
    { keys: ['github'], label: 'GitHub' },
    { keys: ['stackoverflow', 'stack overflow'], label: 'Stack Overflow' },
    { keys: ['figma'], label: 'Figma' },
    { keys: ['chatgpt'], label: 'ChatGPT' },
    { keys: ['claude'], label: 'Claude' },
    { keys: ['gemini'], label: 'Gemini' }
  ];

  const resolveKnownSite = (value) => {
    const lower = String(value || '').toLowerCase();
    const match = knownSites.find(site => site.keys.some(key => lower.includes(key)));
    return match ? match.label : null;
  };

  const knownWholeTitle = resolveKnownSite(cleanTitle);
  if (knownWholeTitle) return knownWholeTitle;
  
  // 2. Split by common separators
  const separators = [' - ', ' | ', ' · ', ' • ', ' : '];
  for (const sep of separators) {
    if (cleanTitle.includes(sep)) {
      const parts = cleanTitle.split(sep).map(p => p.replace(/^\(?\d+\)?\s+/, '').trim()).filter(Boolean);
      if (parts.length >= 2) {
        const first = parts[0];
        const last = parts[parts.length - 1];
        
        const knownFirst = resolveKnownSite(first);
        if (knownFirst) return knownFirst;

        const knownLast = resolveKnownSite(last);
        if (knownLast) return knownLast;
        
        // Otherwise, default to the last part (e.g., "Page Title - GitHub")
        // unless the last part is very long (> 20 chars) and the first is short (< 15 chars)
        if (last.length > 20 && first.length < 15) {
          return first;
        }
        return last;
      }
    }
  }
  
  // Fallback: Return first 20 characters of clean title
  return cleanTitle.length > 20 ? cleanTitle.slice(0, 18) + '..' : cleanTitle;
}

/**
 * Resolves a more specific application display name (e.g. splitting browser tabs by site)
 */
export function getDisplayAppName(appName, windowTitle) {
  if (!appName) return 'Unknown';
  
  const appLower = appName.toLowerCase();
  
  // Detect if the app is a browser
  const isBrowser = appLower.includes('chrome') || 
                    appLower.includes('brave') || 
                    appLower.includes('firefox') || 
                    appLower.includes('safari') || 
                    appLower.includes('edge') || 
                    appLower.includes('opera') || 
                    appLower.includes('yandex') || 
                    appLower.includes('internet explorer') ||
                    (appLower.includes('browser') && !appLower.includes('windows'));
                    
  if (isBrowser && windowTitle) {
    let displayName = appName;
    if (appLower.includes('brave')) displayName = 'Brave';
    else if (appLower.includes('chrome')) displayName = 'Chrome';
    else if (appLower.includes('firefox')) displayName = 'Firefox';
    else if (appLower.includes('safari')) displayName = 'Safari';
    else if (appLower.includes('edge')) displayName = 'Edge';
    else if (appLower.includes('opera')) displayName = 'Opera';
    else if (appLower.includes('yandex')) displayName = 'Yandex';
    else if (appLower.includes('internet explorer')) displayName = 'IE';
    else {
      displayName = appName.replace(/browser/gi, '').trim() || 'Browser';
    }
    
    const site = extractSiteName(windowTitle);
    return `${displayName} (${site})`;
  }
  
  return appName;
}

/**
 * Calculate metrics for a set of sessions
 */
export function calculateMetrics(sessions) {
  const productiveList = getConfigAppList('productive');
  const distractingList = getConfigAppList('distracting');

  let totalTracked = 0;
  let activeTime = 0;
  let idleTime = 0;
  let productiveTime = 0;
  let distractingTime = 0;
  let neutralTime = 0;

  const appData = {}; // appName -> { total: 0, productive: 0, distracting: 0, neutral: 0 }

  // Chronological array of active sessions for streak detection
  const chronologicalActive = [];

  for (const session of sessions) {
    const start = session.started_at;
    const end = session.ended_at || Math.floor(Date.now() / 1000);
    const duration = Math.max(0, end - start);

    // Retrospectively filter out ignored apps from reports
    if (isIgnoredApp(session.app_name, session.window_title, session.is_idle === 1)) continue;

    totalTracked += duration;

    if (session.is_idle === 1) {
      idleTime += duration;
    } else {
      activeTime += duration;
      const category = getSessionCategory(session.app_name, session.window_title, productiveList, distractingList);

      if (category === 'productive') productiveTime += duration;
      else if (category === 'distracting') distractingTime += duration;
      else neutralTime += duration;

      // Group by app, using more specific site names for browsers
      const appKey = getDisplayAppName(session.app_name, session.window_title);
      if (!appData[appKey]) {
        appData[appKey] = { name: appKey, duration: 0, category, path: session.app_path || null };
      } else if (session.app_path && !appData[appKey].path) {
        appData[appKey].path = session.app_path;
      }
      appData[appKey].duration += duration;

      chronologicalActive.push({
        app_name: session.app_name,
        window_title: session.window_title,
        started_at: start,
        ended_at: end,
        duration,
        category
      });
    }
  }

  // Focus Score: (Productive Time / Active Time) * 100
  // If Active Time is 0, score is 0.
  const focusScore = activeTime > 0 ? Math.round((productiveTime / activeTime) * 100) : 0;

  // Streak detection: Find longest contiguous block of productive apps.
  // A streak is broken by a distracting app, or any gap > 2 minutes (120s) between sessions,
  // or a neutral session that lasts > 2 minutes.
  let longestStreak = 0;
  let currentStreak = 0;
  let streakStart = null;
  let streakEnd = null;
  let maxStreakStart = null;
  let maxStreakEnd = null;

  for (let i = 0; i < chronologicalActive.length; i++) {
    const current = chronologicalActive[i];
    
    if (current.category === 'productive') {
      if (currentStreak === 0) {
        streakStart = current.started_at;
      }
      currentStreak += current.duration;
      streakEnd = current.ended_at;
      
      if (currentStreak > longestStreak) {
        longestStreak = currentStreak;
        maxStreakStart = streakStart;
        maxStreakEnd = streakEnd;
      }
    } else if (current.category === 'distracting') {
      currentStreak = 0;
      streakStart = null;
      streakEnd = null;
    } else { // neutral app
      // If a neutral app is used for more than 2 minutes, it breaks the streak
      if (current.duration > 120) {
        currentStreak = 0;
        streakStart = null;
        streakEnd = null;
      } else {
        // Otherwise, it counts as a brief gap but doesn't reset if we are on a streak, 
        // we just don't add its duration to the productive streak duration.
        // But if the gap is too long or next item is far away, it will break.
      }
    }

    // Check gap between this session and the next
    if (i < chronologicalActive.length - 1) {
      const next = chronologicalActive[i + 1];
      const gap = next.started_at - current.ended_at;
      if (gap > 120) { // Gap > 2 minutes (e.g. idle or walked away)
        currentStreak = 0;
        streakStart = null;
        streakEnd = null;
      }
    }
  }

  // Worst Distraction Window detection:
  // Divide the tracking period into hourly buckets (e.g. 0-23 hours).
  // Calculate distracting time in each bucket.
  const hourlyDistraction = Array(24).fill(0);
  for (const session of sessions) {
    if (session.is_idle === 1) continue;
    if (isIgnoredApp(session.app_name, session.window_title, false)) continue;

    const category = getSessionCategory(session.app_name, session.window_title, productiveList, distractingList);
    if (category !== 'distracting') continue;

    const start = session.started_at;
    const end = session.ended_at || Math.floor(Date.now() / 1000);
    
    // Distribute session duration across hours
    let tempStart = start;
    while (tempStart < end) {
      const startDateObj = new Date(tempStart * 1000);
      const hour = startDateObj.getHours();
      
      // Calculate start of next hour
      const nextHourDate = new Date(startDateObj);
      nextHourDate.setHours(hour + 1, 0, 0, 0);
      const nextHourTimestamp = Math.floor(nextHourDate.getTime() / 1000);
      
      const chunkEnd = Math.min(end, nextHourTimestamp);
      const duration = chunkEnd - tempStart;
      
      hourlyDistraction[hour] += duration;
      tempStart = chunkEnd;
    }
  }

  let worstHour = -1;
  let maxDistractionInHour = 0;
  for (let h = 0; h < 24; h++) {
    if (hourlyDistraction[h] > maxDistractionInHour) {
      maxDistractionInHour = hourlyDistraction[h];
      worstHour = h;
    }
  }

  let worstDistractionWindow = null;
  if (worstHour !== -1 && maxDistractionInHour > 0) {
    const startHourStr = formatHour(worstHour);
    const endHourStr = formatHour((worstHour + 1) % 24);
    worstDistractionWindow = `${startHourStr} – ${endHourStr}`;
  }

  const apps = Object.values(appData).sort((a, b) => b.duration - a.duration);
  const topProductiveApp = apps.find(app => app.category === 'productive') || null;
  const topDistractingApp = apps.find(app => app.category === 'distracting') || null;
  const topNeutralApp = apps.find(app => app.category === 'neutral') || null;

  return {
    totalTracked,
    activeTime,
    idleTime,
    productiveTime,
    distractingTime,
    neutralTime,
    focusScore,
    longestStreak,
    streakStart: maxStreakStart,
    streakEnd: maxStreakEnd,
    worstDistractionWindow,
    worstDistractionDuration: maxDistractionInHour,
    topProductiveApp,
    topDistractingApp,
    topNeutralApp,
    apps
  };
}

function formatHour(h) {
  const ampm = h >= 12 ? 'PM' : 'AM';
  const displayHour = h % 12 === 0 ? 12 : h % 12;
  return `${displayHour}:00 ${ampm}`;
}
