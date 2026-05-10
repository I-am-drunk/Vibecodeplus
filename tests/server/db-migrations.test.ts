import { describe, test, expect } from 'bun:test'
import { Database } from 'bun:sqlite'
import {
  getCurrentSchemaVersion,
  rollbackMigration,
} from '../../server/state/db.ts'

describe('DB schema migration system', () => {
  function createFreshDb(): Database {
    const db = new Database(':memory:')
    db.exec('PRAGMA foreign_keys = ON')
    db.exec(`
      CREATE TABLE IF NOT EXISTS migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        version INTEGER NOT NULL UNIQUE,
        description TEXT,
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `)
    return db
  }

  test('fresh DB has schema version 0', () => {
    const db = createFreshDb()
    expect(getCurrentSchemaVersion(db)).toBe(0)
    db.close()
  })

  test('after applying migrations, version matches latest', () => {
    const db = createFreshDb()
    // Simulate applying version 1
    db.exec(`
      CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT NOT NULL);
      INSERT INTO migrations (version, description) VALUES (1, 'initial schema');
    `)
    expect(getCurrentSchemaVersion(db)).toBe(1)

    // Simulate applying version 2
    db.exec(`
      ALTER TABLE projects ADD COLUMN description TEXT;
      INSERT INTO migrations (version, description) VALUES (2, 'add description');
    `)
    expect(getCurrentSchemaVersion(db)).toBe(2)
    db.close()
  })

  test('rollbackMigration returns false when no migrations to rollback', () => {
    const db = createFreshDb()
    const result = rollbackMigration(db, 0)
    expect(result).toBe(false)
    db.close()
  })

  test('rollbackMigration returns false when target version is current', () => {
    const db = createFreshDb()
    db.exec(`
      CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT NOT NULL);
      INSERT INTO migrations (version, description) VALUES (1, 'initial schema');
    `)
    const result = rollbackMigration(db, 1)
    expect(result).toBe(false)
    db.close()
  })

  test('rollbackMigration rolls back to target version', () => {
    const db = createFreshDb()
    // Apply v1 and v2
    db.exec(`
      CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT NOT NULL);
      INSERT INTO migrations (version, description) VALUES (1, 'initial schema');
      ALTER TABLE projects ADD COLUMN description TEXT;
      INSERT INTO migrations (version, description) VALUES (2, 'add description');
    `)
    expect(getCurrentSchemaVersion(db)).toBe(2)

    // Rollback to v1
    const result = rollbackMigration(db, 1)
    expect(result).toBe(true)
    expect(getCurrentSchemaVersion(db)).toBe(1)

    // v2 should be removed from migrations table
    const rows = db.prepare('SELECT version FROM migrations ORDER BY version').all() as Array<{ version: number }>
    expect(rows.map((r) => r.version)).toEqual([1])
    db.close()
  })

  test('rollbackMigration rolls back multiple versions in reverse order', () => {
    const db = createFreshDb()
    // Apply v1, v2, v3
    db.exec(`
      CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT NOT NULL);
      INSERT INTO migrations (version, description) VALUES (1, 'initial schema');
      ALTER TABLE projects ADD COLUMN description TEXT;
      INSERT INTO migrations (version, description) VALUES (2, 'add description');
      ALTER TABLE projects ADD COLUMN status TEXT;
      INSERT INTO migrations (version, description) VALUES (3, 'add status');
    `)
    expect(getCurrentSchemaVersion(db)).toBe(3)

    // Rollback to v0
    const result = rollbackMigration(db, 0)
    expect(result).toBe(true)
    expect(getCurrentSchemaVersion(db)).toBe(0)
    db.close()
  })

  test('migrations are idempotent — re-applying does not duplicate', () => {
    const db = createFreshDb()
    db.exec(`
      CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT NOT NULL);
      INSERT INTO migrations (version, description) VALUES (1, 'initial schema');
    `)

    // Try to insert v1 again — should fail due to UNIQUE constraint
    expect(() => {
      db.exec('INSERT INTO migrations (version, description) VALUES (1, \'duplicate\')')
    }).toThrow()

    // Only one v1 entry
    const rows = db.prepare('SELECT COUNT(*) as count FROM migrations WHERE version = 1').get() as any
    expect(rows.count).toBe(1)
    db.close()
  })

  test('migration table has description column', () => {
    const db = createFreshDb()
    db.exec(`
      INSERT INTO migrations (version, description) VALUES (1, 'test description');
    `)
    const row = db.prepare('SELECT description FROM migrations WHERE version = 1').get() as any
    expect(row.description).toBe('test description')
    db.close()
  })
})
