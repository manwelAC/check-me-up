import chalk from 'chalk';
import { getSessionsForPeriod } from '../db/queries.js';
import { formatDuration, formatTime, drawBar, calculateMetrics, getSessionCategory } from './renderer.js';
import { getConfigAppList } from '../config/index.js';

/**
 * Get date timestamps for the start and end of a local day
 */
export function getDayTimestamps(dateStr) {
  let date;
  if (dateStr) {
    date = new Date(dateStr + 'T00:00:00');
  } else {
    date = new Date();
  }
  
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  
  return {
    start: Math.floor(start.getTime() / 1000),
    end: Math.floor(end.getTime() / 1000),
    displayDate: date.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  };
}

/**
 * Render Daily Report to the console
 */
export function renderDailyReport(dateStr) {
  const { start, end, displayDate } = getDayTimestamps(dateStr);
  const sessions = getSessionsForPeriod(start, end);
  
  if (sessions.length === 0) {
    console.log(chalk.yellow(`\n  No activity data tracked for ${displayDate}.\n`));
    return;
  }

  const metrics = calculateMetrics(sessions);

  // Focus score styling
  let scoreSymbol = '❌';
  let scoreColor = chalk.red;
  if (metrics.focusScore >= 80) {
    scoreSymbol = '✅';
    scoreColor = chalk.green;
  } else if (metrics.focusScore >= 50) {
    scoreSymbol = '⚠️';
    scoreColor = chalk.yellow;
  }

  console.log(chalk.cyan('────────────────────────────────────────────────────────────'));
  console.log(chalk.cyan(`  check-me · Daily Report · ${displayDate}`));
  console.log(chalk.cyan('────────────────────────────────────────────────────────────\n'));

  console.log(`  Total tracked time   ${chalk.bold(formatDuration(metrics.totalTracked))}`);
  console.log(`  Active time          ${chalk.bold(chalk.green(formatDuration(metrics.activeTime)))}`);
  console.log(`  Idle time            ${chalk.bold(chalk.yellow(formatDuration(metrics.idleTime)))}`);
  console.log();
  console.log(`  Focus score          ${scoreColor(metrics.focusScore + '/100')}  ${scoreSymbol}`);
  console.log();

  console.log(chalk.cyan('  TOP APPS'));
  console.log(chalk.cyan('  ──────────────────────────────────────────────────────────────────'));

  const maxAppDuration = metrics.apps.length > 0 ? metrics.apps[0].duration : 1;

  for (const app of metrics.apps.slice(0, 10)) {
    const ratio = app.duration / maxAppDuration;
    const bar = drawBar(ratio, 12);
    
    let categorySymbol = '⚠️';
    let appColor = chalk.white;
    
    if (app.category === 'productive') {
      categorySymbol = '✅';
      appColor = chalk.green;
    } else if (app.category === 'distracting') {
      categorySymbol = '❌';
      appColor = chalk.red;
    }

    const appNamePadded = app.name.slice(0, 25).padEnd(26);
    const durationStr = formatDuration(app.duration).padStart(8);

    console.log(`  ${appColor(appNamePadded)} ${chalk.cyan(bar)}  ${durationStr}  ${categorySymbol}`);
  }

  console.log();

  if (metrics.longestStreak > 0) {
    const startStr = formatTime(metrics.streakStart);
    const endStr = formatTime(metrics.streakEnd);
    console.log(`  LONGEST FOCUS STREAK     ${chalk.green(formatDuration(metrics.longestStreak))} (${startStr} – ${endStr})`);
  } else {
    console.log(`  LONGEST FOCUS STREAK     None`);
  }

  if (metrics.worstDistractionWindow) {
    console.log(`  WORST DISTRACTION WINDOW ${chalk.red(metrics.worstDistractionWindow)} (${formatDuration(metrics.worstDistractionDuration)})`);
  } else {
    console.log(`  WORST DISTRACTION WINDOW None`);
  }

  console.log();

  // Dynamic advice tips
  let tipText = 'You are keeping distractions at a minimum. Keep doing what you are doing!';
  if (metrics.focusScore < 50) {
    if (metrics.worstDistractionWindow) {
      tipText = `You spent ${formatDuration(metrics.worstDistractionDuration)} on distracting apps during ${metrics.worstDistractionWindow}.\n       Consider blocking these apps or closing browser tabs in that block.`;
    } else {
      tipText = 'Try to categorize your apps as productive/distracting to get a better assessment.';
    }
  } else if (metrics.idleTime > metrics.activeTime) {
    tipText = 'You were away from your machine for a significant portion of tracked time.\n       Try dividing your goals into smaller, active Pomodoro intervals.';
  } else if (metrics.focusScore >= 80) {
    tipText = 'Excellent focus! You maintained deep blocks of work with minimal interruptions.';
  }

  console.log(`  ${chalk.bold('TIP')}  ${chalk.gray(tipText)}`);
  console.log(chalk.cyan('────────────────────────────────────────────────────────────\n'));
}

/**
 * Render drilldown report for a specific app
 */
export function renderAppDrilldown(appName, dateStr) {
  const { start, end, displayDate } = getDayTimestamps(dateStr);
  const sessions = getSessionsForPeriod(start, end);
  
  const targetAppLower = appName.toLowerCase();
  const appSessions = sessions.filter(s => 
    s.app_name.toLowerCase().includes(targetAppLower) && s.is_idle === 0
  );

  if (appSessions.length === 0) {
    console.log(chalk.yellow(`\n  No activity logs found for app "${appName}" on ${displayDate}.\n`));
    return;
  }

  const productiveList = getConfigAppList('productive');
  const distractingList = getConfigAppList('distracting');

  // Compute metrics for this specific app
  let totalDuration = 0;
  const windows = {};

  for (const s of appSessions) {
    const sEnd = s.ended_at || Math.floor(Date.now() / 1000);
    const duration = Math.max(0, sEnd - s.started_at);
    totalDuration += duration;

    const title = s.window_title || 'Unknown Window';
    if (!windows[title]) {
      windows[title] = { title, duration: 0, count: 0 };
    }
    windows[title].duration += duration;
    windows[title].count += 1;
  }

  // Sort windows by duration descending
  const sortedWindows = Object.values(windows).sort((a, b) => b.duration - a.duration);

  // App category
  const actualAppName = appSessions[0].app_name;
  const category = getSessionCategory(actualAppName, '', productiveList, distractingList);
  let categoryStr = 'Neutral';
  let categoryColor = chalk.white;
  if (category === 'productive') {
    categoryStr = 'Productive';
    categoryColor = chalk.green;
  } else if (category === 'distracting') {
    categoryStr = 'Distracting';
    categoryColor = chalk.red;
  }

  console.log(chalk.cyan('────────────────────────────────────────────────────────────'));
  console.log(chalk.cyan(`  check-me · App Drilldown · ${actualAppName}`));
  console.log(chalk.cyan(`  Date: ${displayDate}`));
  console.log(chalk.cyan('────────────────────────────────────────────────────────────\n'));

  console.log(`  Category:     ${categoryColor(categoryStr)}`);
  console.log(`  Total Time:   ${chalk.bold(formatDuration(totalDuration))}`);
  console.log(`  Instances:    ${appSessions.length} focus period(s)`);
  console.log();

  console.log(chalk.cyan('  WINDOW TITLES / CONTEXTS'));
  console.log(chalk.cyan('  ────────────────────────────────────────────────────────'));

  const maxWinDuration = sortedWindows.length > 0 ? sortedWindows[0].duration : 1;

  for (const win of sortedWindows.slice(0, 15)) {
    const ratio = win.duration / maxWinDuration;
    const bar = drawBar(ratio, 8);
    const titlePadded = win.title.slice(0, 24).padEnd(25);
    const durationStr = formatDuration(win.duration).padStart(8);
    
    console.log(`  ${chalk.gray(titlePadded)} ${chalk.cyan(bar)}  ${durationStr}  (${win.count}x)`);
  }

  console.log(chalk.cyan('────────────────────────────────────────────────────────────\n'));
}
