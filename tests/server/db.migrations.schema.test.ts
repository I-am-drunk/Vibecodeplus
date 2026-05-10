import { describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { ensureMigrationTables } from '../../server/state/migrations.ts'

describe('migration/alias schema', () => {
  test('ensureMigrationTables creates required tables and indexes', () => {
    const db = new Database(':memory:')
    db.exec('PRAGMA foreign_keys = ON')

    db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY
      );
    `)

    ensureMigrationTables(db)

    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('project_migrations', 'project_aliases')`)
      .all() as Array<{ name: string }>

    expect(tables.map((t) => t.name).sort()).toEqual(['project_aliases', 'project_migrations'])

    const indexes = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type = 'index' AND name IN (
          'idx_project_migrations_source',
          'idx_project_migrations_target',
          'idx_project_migrations_status',
          'idx_project_aliases_canonical'
        )`,
      )
      .all() as Array<{ name: string }>

    const indexNames = indexes.map((idx) => idx.name).sort()
    expect(indexNames).toEqual(
      [
        'idx_project_aliases_canonical',
        'idx_project_migrations_source',
        'idx_project_migrations_status',
        'idx_project_migrations_target',
      ].sort(),
    )

    const migrationFks = db.prepare(`PRAGMA foreign_key_list('project_migrations')`).all() as Array<{
      table: string
      from: string
      to: string
      on_delete: string
    }>
    expect(migrationFks.some((fk) => fk.table === 'projects' && fk.from === 'source_project_id' && fk.to === 'id')).toBe(true)
    expect(migrationFks.some((fk) => fk.table === 'projects' && fk.from === 'target_project_id' && fk.to === 'id')).toBe(true)

    const aliasFks = db.prepare(`PRAGMA foreign_key_list('project_aliases')`).all() as Array<{
      table: string
      from: string
      to: string
      on_delete: string
    }>
    expect(aliasFks.some((fk) => fk.table === 'projects' && fk.from === 'source_project_id' && fk.to === 'id')).toBe(true)
    expect(aliasFks.some((fk) => fk.table === 'projects' && fk.from === 'canonical_project_id' && fk.to === 'id')).toBe(true)
    expect(aliasFks.some((fk) => fk.table === 'project_migrations' && fk.from === 'migration_id' && fk.to === 'id')).toBe(true)
  })
})
