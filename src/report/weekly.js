import chalk from 'chalk';
import { getSessionsForPeriod } from '../db/queries.js';
import { formatDuration, drawBar, calculateMetrics } from './renderer.js';

export function getWeekRange(dateStr) {
  let date;
  if (dateStr) {
    date = new Date(dateStr + 'T00:00:00');
  } else {
    date = new Date();
  }
  
  const day = date.getDay();
  // Adjust so Monday is day 1, Sunday is day 7. If day is 0 (Sunday), treat it as 7.
  const diffToMonday = date.getDate() - (day === 0 ? 6 : day - 1);
  
  const monday = new Date(date);
  monday.setDate(diffToMonday);
  monday.setHours(0, 0, 0, 0);
  
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  
  return {
    start: Math.floor(monday.getTime() / 1000),
    end: Math.floor(sunday.getTime() / 1000),
    monday,
    sunday
  };
}

export function renderWeeklyReport(dateStr) {
  const { start, end, monday, sunday } = getWeekRange(dateStr);
  
  const formatDateLabel = (d) => {
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };
  
  const titleRange = `${formatDateLabel(monday)} – ${formatDateLabel(sunday)}, ${monday.getFullYear()}`;
  const sessions = getSessionsForPeriod(start, end);
  
  if (sessions.length === 0) {
    console.log(chalk.yellow(`\n  No activity data tracked for the week of ${titleRange}.\n`));
    return;
  }

  const weeklyMetrics = calculateMetrics(sessions);

  // Focus score styling
  let scoreSymbol = '❌';
  let scoreColor = chalk.red;
  if (weeklyMetrics.focusScore >= 80) {
    scoreSymbol = '✅';
    scoreColor = chalk.green;
  } else if (weeklyMetrics.focusScore >= 50) {
    scoreSymbol = '⚠️';
    scoreColor = chalk.yellow;
  }

  console.log(chalk.cyan('────────────────────────────────────────────────────────────'));
  console.log(chalk.cyan(`  check-me · Weekly Report · ${titleRange}`));
  console.log(chalk.cyan('────────────────────────────────────────────────────────────\n'));

  console.log(`  Total tracked time   ${chalk.bold(formatDuration(weeklyMetrics.totalTracked))}`);
  console.log(`  Active time          ${chalk.bold(chalk.green(formatDuration(weeklyMetrics.activeTime)))}`);
  console.log(`  Idle time            ${chalk.bold(chalk.yellow(formatDuration(weeklyMetrics.idleTime)))}`);
  console.log();
  console.log(`  Weekly focus score   ${scoreColor(weeklyMetrics.focusScore + '/100')}  ${scoreSymbol}`);
  console.log();

  // Daily breakdown
  console.log(chalk.cyan('  DAILY BREAKDOWN'));
  console.log(chalk.cyan('  ────────────────────────────────────────────────────────'));

  const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const dailySessions = Array(7).fill(null).map(() => []);

  // Bucket sessions by day of week
  for (const session of sessions) {
    const sessionDate = new Date(session.started_at * 1000);
    let dayIndex = sessionDate.getDay() - 1; // Monday=0, ..., Saturday=5
    if (dayIndex === -1) dayIndex = 6; // Sunday=6
    
    // Safety check that session fits in this week
    if (dayIndex >= 0 && dayIndex < 7) {
      dailySessions[dayIndex].push(session);
    }
  }

  let maxDailyActive = 1;
  const dailyMetricsList = weekdays.map((name, index) => {
    const daySessions = dailySessions[index];
    if (daySessions.length === 0) {
      return { name, activeTime: 0, focusScore: 0, tracked: false };
    }
    const dayMetrics = calculateMetrics(daySessions);
    if (dayMetrics.activeTime > maxDailyActive) {
      maxDailyActive = dayMetrics.activeTime;
    }
    return {
      name,
      activeTime: dayMetrics.activeTime,
      focusScore: dayMetrics.focusScore,
      tracked: true
    };
  });

  for (const day of dailyMetricsList) {
    const label = day.name.padEnd(10);
    if (!day.tracked) {
      console.log(`  ${chalk.gray(label)} No data`);
      continue;
    }

    const ratio = day.activeTime / maxDailyActive;
    const bar = drawBar(ratio, 10);
    
    let scoreColor = chalk.red;
    if (day.focusScore >= 80) scoreColor = chalk.green;
    else if (day.focusScore >= 50) scoreColor = chalk.yellow;
    
    const activeStr = formatDuration(day.activeTime).padStart(8);
    const scoreStr = `${day.focusScore}%`.padStart(4);

    console.log(`  ${chalk.white(label)} ${chalk.cyan(bar)}  ${activeStr}  (Focus: ${scoreColor(scoreStr)})`);
  }

  console.log();

  // Weekly Top Apps
  console.log(chalk.cyan('  TOP APPS FOR THE WEEK'));
  console.log(chalk.cyan('  ──────────────────────────────────────────────────────────────────'));

  const maxAppDuration = weeklyMetrics.apps.length > 0 ? weeklyMetrics.apps[0].duration : 1;

  for (const app of weeklyMetrics.apps.slice(0, 5)) {
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

  // Find most focused day and most distracted day
  let bestDay = null;
  let worstDay = null;
  let maxScore = -1;
  let minScore = 101;

  for (const day of dailyMetricsList) {
    if (!day.tracked || day.activeTime < 1800) continue; // Must have at least 30 minutes of tracking to count
    if (day.focusScore > maxScore) {
      maxScore = day.focusScore;
      bestDay = day.name;
    }
    if (day.focusScore < minScore) {
      minScore = day.focusScore;
      worstDay = day.name;
    }
  }

  let insight = "Not enough data this week to formulate pattern insights. Keep tracking!";
  if (bestDay && maxScore >= 70) {
    insight = `You were most focused on ${chalk.bold(bestDay)} (Score: ${maxScore}/100).`;
    if (worstDay && minScore < 50 && bestDay !== worstDay) {
      insight += `\n       Focus took a dip on ${chalk.bold(worstDay)} (Score: ${minScore}/100) — keep an eye on distractions there.`;
    }
  }

  console.log(`  ${chalk.bold('INSIGHT')}  ${chalk.gray(insight)}`);
  console.log(chalk.cyan('────────────────────────────────────────────────────────────\n'));
}

export function getWeeklyMetrics(dateStr) {
  const { start, end, monday, sunday } = getWeekRange(dateStr);
  const sessions = getSessionsForPeriod(start, end);
  
  if (sessions.length === 0) {
    return {
      empty: true,
      rangeText: `${monday.toLocaleDateString()} - ${sunday.toLocaleDateString()}`
    };
  }

  const weeklyMetrics = calculateMetrics(sessions);
  
  const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const dailySessions = Array(7).fill(null).map(() => []);

  for (const session of sessions) {
    const sessionDate = new Date(session.started_at * 1000);
    let dayIndex = sessionDate.getDay() - 1; // Monday=0, ..., Saturday=5
    if (dayIndex === -1) dayIndex = 6; // Sunday=6
    
    if (dayIndex >= 0 && dayIndex < 7) {
      dailySessions[dayIndex].push(session);
    }
  }

  const dailyMetricsList = weekdays.map((name, index) => {
    const daySessions = dailySessions[index];
    if (daySessions.length === 0) {
      return { name, activeTime: 0, idleTime: 0, focusScore: 0, tracked: false };
    }
    const dayMetrics = calculateMetrics(daySessions);
    return {
      name,
      activeTime: dayMetrics.activeTime,
      idleTime: dayMetrics.idleTime,
      focusScore: dayMetrics.focusScore,
      tracked: true
    };
  });

  // Calculate best/worst days
  let bestDay = null;
  let worstDay = null;
  let maxScore = -1;
  let minScore = 101;

  for (const day of dailyMetricsList) {
    if (!day.tracked) continue;
    if (day.focusScore > maxScore) {
      maxScore = day.focusScore;
      bestDay = day.name;
    }
    if (day.focusScore < minScore) {
      minScore = day.focusScore;
      worstDay = day.name;
    }
  }

  let insight = "Not enough data this week to formulate pattern insights. Keep tracking!";
  if (bestDay && maxScore >= 70) {
    insight = `You were most focused on ${bestDay} (Score: ${maxScore}/100).`;
    if (worstDay && minScore < 50 && bestDay !== worstDay) {
      insight += ` Focus took a dip on ${worstDay} (Score: ${minScore}/100) — keep an eye on distractions there.`;
    }
  }

  const insightParts = [];
  const insightCards = [];
  if (bestDay) {
    insightParts.push(`Best focus day: ${bestDay} (${maxScore}/100).`);
    insightCards.push({
      type: maxScore >= 70 ? 'productive' : maxScore >= 50 ? 'neutral' : 'distracting',
      label: 'best focus day',
      value: bestDay,
      meta: `${maxScore}/100`
    });
  }
  if (weeklyMetrics.topProductiveApp) {
    insightParts.push(`Top productive source: ${weeklyMetrics.topProductiveApp.name} (${formatDuration(weeklyMetrics.topProductiveApp.duration)}).`);
    insightCards.push({
      type: 'productive',
      label: 'top productive source',
      value: weeklyMetrics.topProductiveApp.name,
      meta: formatDuration(weeklyMetrics.topProductiveApp.duration)
    });
  }
  if (weeklyMetrics.topDistractingApp) {
    const windowText = weeklyMetrics.worstDistractionWindow
      ? `, mostly around ${weeklyMetrics.worstDistractionWindow}`
      : '';
    insightParts.push(`Biggest distraction: ${weeklyMetrics.topDistractingApp.name} (${formatDuration(weeklyMetrics.topDistractingApp.duration)}${windowText}).`);
    insightCards.push({
      type: 'distracting',
      label: 'biggest distraction',
      value: weeklyMetrics.topDistractingApp.name,
      meta: weeklyMetrics.worstDistractionWindow
        ? `${formatDuration(weeklyMetrics.topDistractingApp.duration)} · ${weeklyMetrics.worstDistractionWindow}`
        : formatDuration(weeklyMetrics.topDistractingApp.duration)
    });
  }
  if (weeklyMetrics.topNeutralApp && weeklyMetrics.topNeutralApp.duration >= 900) {
    insightParts.push(`Review neutral app: ${weeklyMetrics.topNeutralApp.name} has ${formatDuration(weeklyMetrics.topNeutralApp.duration)} unclassified.`);
    insightCards.push({
      type: 'neutral',
      label: 'review neutral app',
      value: weeklyMetrics.topNeutralApp.name,
      meta: `${formatDuration(weeklyMetrics.topNeutralApp.duration)} unclassified`
    });
  }
  if (worstDay && minScore < 50 && bestDay !== worstDay) {
    insightParts.push(`Focus dipped on ${worstDay} (${minScore}/100).`);
    insightCards.push({
      type: 'distracting',
      label: 'focus dip',
      value: worstDay,
      meta: `${minScore}/100`
    });
  }

  const insightText = insightParts.length
    ? insightParts.join(' ')
    : insight;

  return {
    empty: false,
    rangeText: `${monday.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${sunday.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${monday.getFullYear()}`,
    totalTracked: weeklyMetrics.totalTracked,
    activeTime: weeklyMetrics.activeTime,
    idleTime: weeklyMetrics.idleTime,
    focusScore: weeklyMetrics.focusScore,
    apps: weeklyMetrics.apps,
    daily: dailyMetricsList,
    insightCards,
    insight: insightText
  };
}
