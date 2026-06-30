import chalk from 'chalk';
import { getActiveSession, getSessionsForPeriod } from '../db/queries.js';
import { getDayTimestamps } from './daily.js';
import { formatDuration, formatTime, drawBar, calculateMetrics } from './renderer.js';
import { isRunning } from '../daemon/index.js';

export function startLiveDashboard() {
  console.clear();
  
  const update = async () => {
    try {
      // 1. Check if daemon process is running and get active session
      const daemonPid = isRunning();
      const active = getActiveSession();
      
      // 2. Fetch all sessions for today
      const { start, end, displayDate } = getDayTimestamps();
      const sessions = getSessionsForPeriod(start, end);
      const metrics = calculateMetrics(sessions);
      
      // 3. Reset cursor and clear screen down to prevent trailing text/flicker
      process.stdout.write('\x1B[H\x1B[J');
      
      // 4. Render Layout
      console.log(chalk.cyan('────────────────────────────────────────────────────────────'));
      console.log(chalk.cyan(`  check-me · Live Dashboard · ${displayDate}`));
      console.log(chalk.cyan('────────────────────────────────────────────────────────────'));
      
      // Active Tracking Status Line
      if (daemonPid) {
        if (active) {
          const isIdle = active.is_idle === 1;
          const statusColor = isIdle ? chalk.yellow : chalk.green;
          const statusText = isIdle ? 'IDLE' : 'ACTIVE';
          
          console.log(`  Status:    ${statusColor.bold('● ' + statusText)}`);
          console.log(`  App:       ${chalk.white.bold(active.app_name.slice(0, 40))}`);
          console.log(`  Title:     ${chalk.gray((active.window_title || 'None').slice(0, 46))}`);
          const duration = Math.floor(Date.now() / 1000) - active.started_at;
          console.log(`  Duration:  ${chalk.cyan(formatDuration(duration))} (since ${formatTime(active.started_at)})`);
        } else {
          console.log(`  Status:    ${chalk.blue.bold('● MONITORING (Excluding Ignored App)')}`);
          console.log('  App:       - (Ignored)');
          console.log('  Title:     - (Ignored)');
          console.log('  Duration:  -');
        }
      } else {
        console.log(`  Status:    ${chalk.red.bold('● OFFLINE (Daemon stopped)')}`);
        console.log('  App:       -');
        console.log('  Title:     -');
        console.log('  Duration:  -');
      }
      
      console.log(chalk.cyan('────────────────────────────────────────────────────────────'));
      
      // Metrics Summary
      console.log(`  Total tracked today: ${chalk.bold(formatDuration(metrics.totalTracked))}`);
      console.log(`  Active time:         ${chalk.bold(chalk.green(formatDuration(metrics.activeTime)))}`);
      console.log(`  Idle time:           ${chalk.bold(chalk.yellow(formatDuration(metrics.idleTime)))}`);
      
      // Focus Score
      let scoreSymbol = '❌';
      let scoreColor = chalk.red;
      if (metrics.focusScore >= 80) {
        scoreSymbol = '✅';
        scoreColor = chalk.green;
      } else if (metrics.focusScore >= 50) {
        scoreSymbol = '⚠️';
        scoreColor = chalk.yellow;
      }
      
      console.log(`  Focus score:         ${scoreColor(metrics.focusScore + '/100')}  ${scoreSymbol}`);
      
      console.log(chalk.cyan('────────────────────────────────────────────────────────────'));
      console.log(chalk.cyan('  TOP APPS TODAY'));
      console.log(chalk.cyan('  ──────────────────────────────────────────────────────────────────'));
      
      const maxAppDuration = metrics.apps.length > 0 ? metrics.apps[0].duration : 1;
      for (const app of metrics.apps.slice(0, 5)) {
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
      
      console.log(chalk.cyan('────────────────────────────────────────────────────────────'));
      console.log(chalk.gray('  Press Ctrl+C to exit Live Mode. Dashboard updates every 2s.'));
      console.log(chalk.cyan('────────────────────────────────────────────────────────────'));
    } catch (e) {
      console.error('Error rendering live dashboard:', e);
    }
  };
  
  update();
  const timer = setInterval(update, 2000);
  
  // Clean exit handling (restoring cursor)
  process.on('SIGINT', () => {
    clearInterval(timer);
    process.stdout.write('\x1B[?25h'); // restore cursor
    console.log('\n  Live Dashboard exited. Keep focused!\n');
    process.exit(0);
  });
  
  process.stdout.write('\x1B[?25l'); // hide cursor during updates
}
