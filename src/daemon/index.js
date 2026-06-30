import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PID_PATH, LOG_PATH } from '../db/schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TRACKER_PATH = path.join(__dirname, 'tracker.js');
const APP_ROOT = path.join(__dirname, '../..');

function getTrackerLaunchArgs() {
  if (process.versions?.electron) {
    const isDefaultElectronBinary = process.defaultApp || path.basename(process.execPath).toLowerCase() === 'electron.exe';
    return {
      command: process.execPath,
      args: isDefaultElectronBinary ? [APP_ROOT, '--tracker'] : ['--tracker']
    };
  }

  return { command: process.execPath, args: [TRACKER_PATH] };
}

/**
 * Check if the daemon is currently running.
 * Returns the PID if running, false otherwise.
 */
export function isRunning() {
  if (!fs.existsSync(PID_PATH)) return false;
  try {
    const pid = parseInt(fs.readFileSync(PID_PATH, 'utf8').trim(), 10);
    if (isNaN(pid)) return false;
    process.kill(pid, 0); // Check if process exists
    return pid;
  } catch (e) {
    // Process is not running or PID file is corrupt, clean up
    try {
      fs.unlinkSync(PID_PATH);
    } catch (_) {}
    return false;
  }
}

/**
 * Start the background daemon.
 */
export function startDaemon() {
  const pid = isRunning();
  if (pid) {
    return { success: false, message: `Daemon is already running with PID ${pid}.` };
  }

  // Ensure directories exist
  const logDir = path.dirname(LOG_PATH);
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  const { command, args } = getTrackerLaunchArgs();

  // Spawn tracker process in background (detached)
  const child = spawn(command, args, {
    detached: true,
    stdio: 'ignore',
  });

  child.unref();

  // Write PID to file
  fs.writeFileSync(PID_PATH, child.pid.toString(), 'utf8');

  return { success: true, pid: child.pid, message: `Daemon started with PID ${child.pid}.` };
}

/**
 * Stop the background daemon.
 */
export function stopDaemon() {
  const pid = isRunning();
  if (!pid) {
    return { success: false, message: 'Daemon is not running.' };
  }

  try {
    process.kill(pid, 'SIGTERM');
  } catch (e) {
    // If SIGTERM is not supported, attempt standard kill
    try {
      process.kill(pid);
    } catch (_) {}
  }

  // Wait for up to 1 second for the process to exit
  let attempts = 0;
  while (attempts < 10) {
    try {
      process.kill(pid, 0);
      // Wait 100ms synchronously
      const start = Date.now();
      while (Date.now() - start < 100) {}
      attempts++;
    } catch (e) {
      // Process exited
      break;
    }
  }

  // Clean up PID file
  try {
    if (fs.existsSync(PID_PATH)) {
      fs.unlinkSync(PID_PATH);
    }
  } catch (_) {}

  return { success: true, message: 'Daemon stopped.' };
}
