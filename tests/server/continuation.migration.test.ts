import { describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import {
  createProjectMigration,
  ensureMigrationTables,
  markMigrationCompleted,
  markMigrationFailed,
  resolveCanonicalProjectId,
  setMigrationTarget,
  upsertProjectAlias,
} from '../../server/state/migrations.ts'
import { verifyProjectPresenceForContinuation } from '../../server/continuation/orchestrator.ts'

describe('continuation migration safety', () => {
  test('malformed listProjects payload does not crash continuation verification', () => {
    const malformed = {
      ok: true,
      data: {
        projects: {
          unexpected: true,
        },
      },
    }

    expect(verifyProjectPresenceForContinuation(malformed, 'target-1')).toBe(false)
  })

  test('migration mapping persistence and source preservation on partial failure', () => {
    const db = new Database(':memory:')

    db.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        name TEXT
      );
    `)

    ensureMigrationTables(db)

    db.prepare('INSERT INTO projects (id, name) VALUES (?, ?)').run('source-1', 'Source')
    db.prepare('INSERT INTO projects (id, name) VALUES (?, ?)').run('target-1', 'Target')

    const migration = createProjectMigration('source-1', db)
    setMigrationTarget(migration.id, 'target-1', db)

    const partial = markMigrationFailed(
      migration.id,
      {
        errorCode: 'SNAPSHOT_TRANSFER_FAILED',
        errorMessage: 'snapshot transfer failed',
        partial: true,
        sourcePreserved: true,
        targetProjectId: 'target-1',
      },
      db,
    )

    expect(partial.status).toBe('partial_failed')
    expect(partial.sourcePreserved).toBe(true)
    expect(partial.targetProjectId).toBe('target-1')

    const completed = markMigrationCompleted(migration.id, 'target-1', { sourcePreserved: true }, db)
    upsertProjectAlias('source-1', 'target-1', completed.id, db)

    const resolved = resolveCanonicalProjectId('source-1', db)
    expect(resolved.canonicalProjectId).toBe('target-1')
    expect(resolved.mappedFromProjectId).toBe('source-1')

    db.close()
  })
})
