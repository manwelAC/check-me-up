import { getDB } from './schema.js';

/**
 * Get the currently open session (where ended_at is null)
 */
export function getActiveSession() {
  const db = getDB();
  return db.prepare('SELECT * FROM sessions WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1').get();
}

/**
 * Close a specific session by ID
 */
export function closeSession(id, endedAt) {
  const db = getDB();
  return db.prepare('UPDATE sessions SET ended_at = ? WHERE id = ?').run(endedAt, id);
}

/**
 * Close all sessions that are currently open
 */
export function closeAllOpenSessions(endedAt) {
  const db = getDB();
  return db.prepare('UPDATE sessions SET ended_at = ? WHERE ended_at IS NULL').run(endedAt);
}

/**
 * Create a new session
 */
export function createSession(appName, windowTitle, startedAt, isIdle = 0, appPath = null) {
  const db = getDB();
  const result = db.prepare(`
    INSERT INTO sessions (app_name, window_title, started_at, is_idle, app_path)
    VALUES (?, ?, ?, ?, ?)
  `).run(appName, windowTitle, startedAt, isIdle, appPath);
  return result.lastInsertRowid;
}

/**
 * Get all sessions in a specific Unix timestamp range
 */
export function getSessionsForPeriod(startedAfter, endedBefore) {
  const db = getDB();
  return db.prepare(`
    SELECT * FROM sessions
    WHERE started_at >= ? AND (ended_at <= ? OR ended_at IS NULL)
    ORDER BY started_at ASC
  `).all(startedAfter, endedBefore);
}

/**
 * Clear data older than a certain Unix timestamp
 */
export function clearSessionsOlderThan(cutoffTimestamp) {
  const db = getDB();
  return db.prepare('DELETE FROM sessions WHERE started_at < ?').run(cutoffTimestamp);
}

/**
 * Get all sessions for raw export
 */
export function getAllSessionsForExport() {
  const db = getDB();
  return db.prepare('SELECT * FROM sessions ORDER BY started_at ASC').all();
}
