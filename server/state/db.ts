import { Database } from 'bun:sqlite'
import { mkdirSync } from 'fs'
import { join } from 'path'
import { getDataDir } from './config.ts'
import { ensureMigrationTables } from './migrations.ts'
import { createLogger } from '../lib/logger.ts'

const log = createLogger('db')

let db: Database

interface SchemaMigration {
  version: number
  description: string
  up: string
  down: string
}

/**
 * Ordered list of schema migrations.
 * Each migration is applied exactly once, tracked in the `migrations` table.
 * Rollback is supported via the `down` SQL.
 */
const SCHEMA_MIGRATIONS: SchemaMigration[] = [
  {
    version: 1,
    description: 'initial schema',
    up: `
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        default_model TEXT DEFAULT 'claude-sonnet-4-6',
        last_opened_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        sandbox_host TEXT,
        sandbox_port INTEGER,
        sandbox_user TEXT,
        sandbox_key_path TEXT,
        sandbox_acquired_at DATETIME,
        api_key_hash TEXT,
        snapshot_dir TEXT,
        snapshot_at DATETIME
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
      CREATE INDEX IF NOT EXISTS idx_projects_last_opened ON projects(last_opened_at DESC);
      CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_id, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, created_at ASC);
      CREATE INDEX IF NOT EXISTS idx_backups_project ON backups(project_id, created_at DESC);
    `,
    down: `
      DROP TABLE IF EXISTS kv;
      DROP TABLE IF EXISTS backups;
      DROP TABLE IF EXISTS messages;
      DROP TABLE IF EXISTS sessions;
      DROP TABLE IF EXISTS projects;
    `,
  },
  {
    version: 2,
    description: 'add stream_id to messages',
    up: `
      ALTER TABLE messages ADD COLUMN stream_id TEXT;
      CREATE INDEX IF NOT EXISTS idx_messages_stream_id ON messages(stream_id);
    `,
    down: `
      DROP INDEX IF EXISTS idx_messages_stream_id;
      -- SQLite does not support DROP COLUMN; stream_id remains but is unused
    `,
  },
  {
    version: 3,
    description: 'add request_id to messages for correlation traceability',
    up: `
      ALTER TABLE messages ADD COLUMN request_id TEXT;
      CREATE INDEX IF NOT EXISTS idx_messages_request_id ON messages(request_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_assistant_stream_unique
        ON messages(session_id, stream_id)
        WHERE role = 'assistant' AND stream_id IS NOT NULL;
    `,
    down: `
      DROP INDEX IF EXISTS idx_messages_assistant_stream_unique;
      DROP INDEX IF EXISTS idx_messages_request_id;
    `,
  },
]

function getAppliedVersions(db: Database): Set<number> {
  const rows = db.prepare('SELECT version FROM migrations').all() as Array<{ version: number }>
  return new Set(rows.map((r) => r.version))
}

function applyMigration(db: Database, migration: SchemaMigration) {
  db.exec('BEGIN')
  try {
    db.exec(migration.up)
    db.prepare('INSERT INTO migrations (version, description, applied_at) VALUES (?, ?, datetime(\'now\'))').run(
      migration.version,
      migration.description,
    )
    db.exec('COMMIT')
    log.info({ version: migration.version, description: migration.description }, 'schema migration applied')
  } catch (error) {
    db.exec('ROLLBACK')
    log.error({ version: migration.version, error: String(error) }, 'schema migration failed')
    throw error
  }
}

export function rollbackMigration(db: Database, targetVersion: number): boolean {
  const applied = getAppliedVersions(db)
  const toRollback = SCHEMA_MIGRATIONS
    .filter((m) => m.version > targetVersion && applied.has(m.version))
    .sort((a, b) => b.version - a.version)

  if (toRollback.length === 0) {
    log.info({ targetVersion }, 'no migrations to rollback')
    return false
  }

  for (const migration of toRollback) {
    db.exec('BEGIN')
    try {
      db.exec(migration.down)
      db.prepare('DELETE FROM migrations WHERE version = ?').run(migration.version)
      db.exec('COMMIT')
      log.info({ version: migration.version, description: migration.description }, 'schema migration rolled back')
    } catch (error) {
      db.exec('ROLLBACK')
      log.error({ version: migration.version, error: String(error) }, 'schema rollback failed')
      throw error
    }
  }

  return true
}

export function getCurrentSchemaVersion(db: Database): number {
  const applied = getAppliedVersions(db)
  return applied.size > 0 ? Math.max(...applied) : 0
}

export function initDB(): Database {
  const dataDir = getDataDir()
  mkdirSync(dataDir, { recursive: true })

  const dbPath = join(dataDir, 'data.db')
  db = new Database(dbPath)

  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec('PRAGMA busy_timeout = 5000')

  // Ensure migrations tracking table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      version INTEGER NOT NULL UNIQUE,
      description TEXT,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `)

  // Apply pending migrations
  const applied = getAppliedVersions(db)
  for (const migration of SCHEMA_MIGRATIONS) {
    if (!applied.has(migration.version)) {
      applyMigration(db, migration)
    }
  }

  ensureMigrationTables(db)

  return db
}

export function getDB(): Database {
  if (!db) throw new Error('Database not initialized. Call initDB() first.')
  return db
}
