import { DatabaseSync } from 'node:sqlite';
import os from 'os';
import path from 'path';
import fs from 'fs';

const DB_DIR = path.join(os.homedir(), '.check-me');
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

export const DB_PATH = path.join(DB_DIR, 'check-me.db');
export const LOG_PATH = path.join(DB_DIR, 'daemon.log');
export const PID_PATH = path.join(DB_DIR, 'daemon.pid');

let databaseInstance = null;

export function getDB() {
  if (!databaseInstance) {
    databaseInstance = new DatabaseSync(DB_PATH);
  }
  return databaseInstance;
}

export function initDB() {
  const db = getDB();
  
  // Create sessions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      app_name     TEXT NOT NULL,
      window_title TEXT,
      app_path     TEXT,             -- Path to the application executable
      started_at   INTEGER NOT NULL, -- Unix timestamp in seconds
      ended_at     INTEGER,          -- Unix timestamp in seconds
      is_idle      INTEGER DEFAULT 0 -- 1 if idle, 0 if active
    );
  `);

  // Migration: Add app_path column to existing installations
  try {
    db.exec("ALTER TABLE sessions ADD COLUMN app_path TEXT;");
  } catch (e) {
    // Ignore error if column already exists
  }

  // Create config table
  db.exec(`
    CREATE TABLE IF NOT EXISTS config (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Initialize default configuration values if they do not exist
  const defaultConfig = [
    { key: 'productive', value: 'VS Code, Terminal, Figma, Cursor, Xcode' },
    { key: 'distracting', value: 'YouTube, Twitter, Reddit, Facebook, Netflix, Twitch' },
    { key: 'idle_threshold', value: '60' }, // seconds
    { key: 'ignored', value: 'Windows Terminal, Windows Terminal Host, check-me, cmd, powershell' }
  ];

  const checkStmt = db.prepare('SELECT 1 FROM config WHERE key = ?');
  const insertStmt = db.prepare('INSERT INTO config (key, value) VALUES (?, ?)');

  for (const item of defaultConfig) {
    const exists = checkStmt.get(item.key);
    if (!exists) {
      insertStmt.run(item.key, item.value);
    }
  }
}
