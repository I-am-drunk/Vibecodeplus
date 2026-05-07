import { Database } from 'bun:sqlite'
import { mkdirSync } from 'fs'
import { join } from 'path'
import { getDataDir } from './config.ts'

let db: Database

export function initDB(): Database {
  const dataDir = getDataDir()
  mkdirSync(dataDir, { recursive: true })
  const dbPath = join(dataDir, 'data.db')

  db = new Database(dbPath)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')

  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      version INTEGER NOT NULL UNIQUE,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      default_model TEXT DEFAULT 'claude-sonnet-4-6',
      last_opened_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      sandbox_host TEXT,
      sandbox_port INTEGER,
      sandbox_user TEXT,
      sandbox_key_path TEXT,
      sandbox_acquired_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      model TEXT NOT NULL,
      title TEXT,
      status TEXT DEFAULT 'active',
      message_count INTEGER DEFAULT 0,
      total_input_tokens INTEGER DEFAULT 0,
      total_output_tokens INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
      content TEXT NOT NULL,
      model TEXT,
      tool_calls TEXT,
      reasoning TEXT,
      attachments TEXT,
      input_tokens INTEGER,
      output_tokens INTEGER,
      status TEXT DEFAULT 'complete',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS backups (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      session_id TEXT,
      file_path TEXT NOT NULL,
      file_size INTEGER,
      file_count INTEGER,
      trigger_type TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS kv (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, created_at ASC);
    CREATE INDEX IF NOT EXISTS idx_backups_project ON backups(project_id, created_at DESC);
  `)


  // Continuation migrations
  for (const sql of [
    'ALTER TABLE projects ADD COLUMN api_key_hash TEXT',
    'ALTER TABLE projects ADD COLUMN snapshot_dir TEXT',
    'ALTER TABLE projects ADD COLUMN snapshot_at DATETIME',
  ]) { try { db.exec(sql) } catch { /* already exists */ } }

  return db
}

export function getDB(): Database {
  if (!db) throw new Error('Database not initialized. Call initDB() first.')
  return db
}
