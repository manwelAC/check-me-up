import { getDB, initDB } from '../db/schema.js';

const BUILT_IN_IGNORED_APPS = ['check-me', 'check-me-up'];

// Lazily ensure database is initialized on config access
let isInitialized = false;
function ensureInit() {
  if (!isInitialized) {
    initDB();
    isInitialized = true;
  }
}

/**
 * Get a config value by key
 */
export function getConfig(key) {
  ensureInit();
  const db = getDB();
  const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key);
  return row ? row.value : null;
}

/**
 * Set a config value by key
 */
export function setConfig(key, value) {
  ensureInit();
  const db = getDB();
  db.prepare(`
    INSERT INTO config (key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value.trim());
}

/**
 * Get all configuration key-value pairs
 */
export function getAllConfig() {
  ensureInit();
  const db = getDB();
  const rows = db.prepare('SELECT * FROM config').all();
  const config = {};
  for (const row of rows) {
    config[row.key] = row.value;
  }
  return config;
}

/**
 * Helper to get list of apps for a category
 */
export function getConfigAppList(key) {
  const value = getConfig(key);
  if (!value) return [];
  return value.split(',').map(app => app.trim().toLowerCase()).filter(Boolean);
}

export function getIgnoredAppList() {
  return Array.from(new Set([
    ...getConfigAppList('ignored'),
    ...BUILT_IN_IGNORED_APPS
  ]));
}

export function isIgnoredApp(appName, windowTitle = '', isIdle = false) {
  if (isIdle) return false;

  const appLower = String(appName || '').toLowerCase();
  const titleLower = String(windowTitle || '').toLowerCase();

  if (BUILT_IN_IGNORED_APPS.some(item => appLower.includes(item))) {
    return true;
  }

  return getConfigAppList('ignored').some(item =>
    appLower.includes(item) || titleLower.includes(item)
  );
}
