#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs';
import { startDaemon, stopDaemon, isRunning } from '../src/daemon/index.js';
import { setConfig, getAllConfig } from '../src/config/index.js';
import { initDB, LOG_PATH } from '../src/db/schema.js';
import { clearSessionsOlderThan, getAllSessionsForExport } from '../src/db/queries.js';
import { renderDailyReport, renderAppDrilldown } from '../src/report/daily.js';
import { renderWeeklyReport } from '../src/report/weekly.js';
import { startLiveDashboard } from '../src/report/live.js';

// Ensure DB is initialized before commands run
initDB();

const program = new Command();

program
  .name('check-me')
  .description('A brutally honest distraction tracker for your terminal')
  .version('1.0.0');

program.configureHelp({
  formatHelp: () => {
    // Helper to calculate correct terminal character width (emoji takes 2 columns)
    const getVisualLength = (str) => {
      let len = 0;
      for (const char of str) {
        const code = char.codePointAt(0);
        if (code > 0xffff) {
          len += 2; // Emoji surrogate pair
        } else if (code === 0xfe0f) {
          continue; // Variation selector
        } else {
          len += 1;
        }
      }
      return len;
    };

    const boxLines = [
      '🕵️   C H E C K  ·  M E  ·  U P',
      'The brutally honest distraction tracker for your terminal',
      'Made by manwelAC'
    ];

    const maxWidth = Math.max(...boxLines.map(getVisualLength));
    const border = '─'.repeat(maxWidth + 4);
    
    const box = [
      chalk.cyan(`┌${border}┐`),
      ...boxLines.map((line, idx) => {
        const visualLen = getVisualLength(line);
        const diff = maxWidth - visualLen;
        const padLeft = Math.floor(diff / 2);
        const padRight = diff - padLeft;
        const content = `${' '.repeat(padLeft)}${line}${' '.repeat(padRight)}`;
        
        let styledContent = content;
        if (idx === 0) {
          styledContent = chalk.bold.white(content);
        } else if (idx === 2) {
          styledContent = chalk.gray(content);
        }
        
        return chalk.cyan('│') + `  ${styledContent}  ` + chalk.cyan('│');
      }),
      chalk.cyan(`└${border}┘`)
    ].join('\n');

    return [
      box,
      '',
      chalk.bold('👋 Welcome! Let\'s get honest about where your time goes.'),
      'Here are the commands to control check-me:',
      '',
      chalk.blue.bold('  ⚙️  DAEMON CONTROL'),
      `    ${chalk.blue('check-me start'.padEnd(36))} Start background tracking`,
      `    ${chalk.blue('check-me stop'.padEnd(36))} Stop tracking and cap active session`,
      `    ${chalk.blue('check-me status'.padEnd(36))} Check if the background daemon is active`,
      '',
      chalk.green.bold('  📊 REPORTS & ANALYTICS'),
      `    ${chalk.green('check-me report'.padEnd(36))} View today's focus summary`,
      `      ${chalk.gray('--week'.padEnd(34))} Show weekly breakdown`,
      `      ${chalk.gray('--date <date>'.padEnd(34))} Show report for a specific date (YYYY-MM-DD)`,
      `      ${chalk.gray('--app <name>'.padEnd(34))} Drill down into a specific application`,
      `    ${chalk.green('check-me live'.padEnd(36))} Launch the real-time updating dashboard`,
      '',
      chalk.yellow.bold('  🔧 CONFIGURATION'),
      `    ${chalk.yellow('check-me config show'.padEnd(36))} List classifications & thresholds`,
      `    ${chalk.yellow('check-me config set <key> <value>'.padEnd(36))} Set configuration values`,
      `      ${chalk.gray('Keys:')} user_name, productive, distracting, idle_threshold, ignored`,
      '',
      chalk.magenta.bold('  🧼 HOUSEKEEPING'),
      `    ${chalk.magenta('check-me clear --before <duration>'.padEnd(36))} Purge logs older than duration (e.g. 30d)`,
      `    ${chalk.magenta('check-me export --format <csv|json>'.padEnd(36))} Export raw data to CSV or JSON`,
      '',
      chalk.cyan('  ──────────────────────────────────────────────────────────────────'),
      `  ${chalk.bold('💡 Quick Start')}: Run ${chalk.cyan('check-me start')} to begin tracking, then ${chalk.cyan('check-me live')}!`,
      chalk.cyan('  ──────────────────────────────────────────────────────────────────'),
      ''
    ].join('\n');
  }
});

// Daemon commands
program
  .command('start')
  .description('Start background tracking daemon')
  .action(() => {
    console.log(chalk.blue('Starting check-me background daemon...'));
    const result = startDaemon();
    if (result.success) {
      console.log(chalk.green(`✔ ${result.message}`));
      console.log(chalk.gray(`Logs are being written to: ${LOG_PATH}`));
    } else {
      console.log(chalk.yellow(`⚠ ${result.message}`));
    }
  });

program
  .command('stop')
  .description('Stop background tracking daemon')
  .action(() => {
    console.log(chalk.blue('Stopping check-me background daemon...'));
    const result = stopDaemon();
    if (result.success) {
      console.log(chalk.green(`✔ ${result.message}`));
    } else {
      console.log(chalk.yellow(`⚠ ${result.message}`));
    }
  });

program
  .command('status')
  .description('Check if daemon is running')
  .action(() => {
    const pid = isRunning();
    if (pid) {
      console.log(chalk.green(`● check-me daemon is RUNNING (PID: ${pid})`));
      console.log(chalk.gray(`Log file: ${LOG_PATH}`));
    } else {
      console.log(chalk.red(`○ check-me daemon is STOPPED`));
    }
  });

// Report commands
program
  .command('report')
  .description("Show distraction and productivity report")
  .option('--week', 'Show weekly report breakdown')
  .option('--date <YYYY-MM-DD>', 'Show report for a specific date')
  .option('--app <AppName>', 'Drill down into a specific app')
  .action((options) => {
    const targetDate = options.date;
    const targetApp = options.app;
    
    if (options.week) {
      if (targetApp) {
        console.log(chalk.red('❌ Error: --app drilldown is currently only supported in daily reports.'));
        process.exit(1);
      }
      renderWeeklyReport(targetDate);
    } else if (targetApp) {
      renderAppDrilldown(targetApp, targetDate);
    } else {
      renderDailyReport(targetDate);
    }
  });

program
  .command('live')
  .description("Show real-time dashboard of today's focus metrics")
  .action(() => {
    startLiveDashboard();
  });

// Configuration commands
const configCmd = program.command('config').description('Configure categories and settings');

configCmd
  .command('set <key> [value...]')
  .description('Set a configuration parameter (e.g. productive, distracting, idle_threshold)')
  .action((key, valueArray) => {
    const value = valueArray ? valueArray.join(' ').trim() : '';
    if (!value) {
      console.log(chalk.red('❌ Error: Missing configuration value. Usage: check-me config set <key> <value>'));
      process.exit(1);
    }
    
    const validKeys = ['user_name', 'productive', 'distracting', 'idle_threshold', 'ignored'];
    if (!validKeys.includes(key)) {
      console.log(chalk.red(`❌ Error: Invalid key "${key}". Valid keys are: ${validKeys.join(', ')}`));
      process.exit(1);
    }
    
    if (key === 'idle_threshold') {
      const threshold = parseInt(value, 10);
      if (isNaN(threshold) || threshold <= 0) {
        console.log(chalk.red('❌ Error: idle_threshold must be a positive integer (seconds).'));
        process.exit(1);
      }
    }

    setConfig(key, value);
    console.log(chalk.green(`✔ Config set: ${key} = "${value}"`));
  });

configCmd
  .command('show')
  .description('Show all current configuration parameters')
  .action(() => {
    const configs = getAllConfig();
    console.log(chalk.cyan('\n  check-me Configuration'));
    console.log(chalk.cyan('  ────────────────────────────────'));
    for (const [k, v] of Object.entries(configs)) {
      console.log(`  ${chalk.bold(k.padEnd(16))}: ${v}`);
    }
    console.log();
  });

// Data management commands
program
  .command('clear')
  .description('Clear tracked activity logs older than a specific duration')
  .requiredOption('--before <duration>', 'Duration (e.g., 30d, 7d, 24h)')
  .action((options) => {
    const duration = options.before;
    const match = duration.match(/^(\d+)([dhm])$/);
    if (!match) {
      console.log(chalk.red('❌ Error: Invalid duration format. Examples: 30d, 7d, 24h, 60m'));
      process.exit(1);
    }

    const val = parseInt(match[1], 10);
    const unit = match[2];
    let seconds = 0;
    if (unit === 'd') seconds = val * 24 * 60 * 60;
    else if (unit === 'h') seconds = val * 60 * 60;
    else if (unit === 'm') seconds = val * 60;

    const cutoffTimestamp = Math.floor(Date.now() / 1000) - seconds;
    const dateStr = new Date(cutoffTimestamp * 1000).toLocaleString();

    const result = clearSessionsOlderThan(cutoffTimestamp);
    console.log(chalk.green(`✔ Cleared data older than ${duration} (before ${dateStr}).`));
    console.log(chalk.gray(`Rows deleted: ${result.changes}`));
  });

program
  .command('export')
  .description('Export logged activity raw data')
  .requiredOption('--format <csv|json>', 'Export format (csv or json)')
  .action((options) => {
    const format = options.format.toLowerCase();
    if (format !== 'csv' && format !== 'json') {
      console.log(chalk.red('❌ Error: Format must be either "csv" or "json"'));
      process.exit(1);
    }

    const sessions = getAllSessionsForExport();

    if (format === 'csv') {
      console.log('id,app_name,window_title,started_at,ended_at,is_idle');
      for (const s of sessions) {
        const title = (s.window_title || '').replace(/"/g, '""');
        const app = s.app_name.replace(/"/g, '""');
        console.log(`${s.id},"${app}","${title}",${s.started_at},${s.ended_at || ''},${s.is_idle}`);
      }
    } else {
      console.log(JSON.stringify(sessions, null, 2));
    }
  });

program.parse(process.argv);
