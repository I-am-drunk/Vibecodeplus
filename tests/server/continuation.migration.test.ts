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
  getLatestMigrationForSource,
} from '../../server/state/migrations.ts'
import { verifyProjectPresenceForContinuation, ContinuationOrchestrator } from '../../server/continuation/orchestrator.ts'
import { initDB } from '../../server/state/db.ts'

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

    const migration = createProjectMigration('source-1', null, db)
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

  test('continuation orchestrator reuses targetProjectId on failure', () => {
    const db = initDB() // We need a real DB or mock it
    db.exec(`INSERT OR IGNORE INTO projects (id, name) VALUES ('source-reuse', 'Source')`)
    db.exec(`INSERT OR IGNORE INTO projects (id, name) VALUES ('target-reuse', 'Target')`)
    
    // Fake a previous failed migration
    const failedMigration = createProjectMigration('source-reuse', null, db)
    setMigrationTarget(failedMigration.id, 'target-reuse', db)
    markMigrationFailed(failedMigration.id, { errorCode: 'ERR', errorMessage: 'failed', partial: true }, db)

    const orchestrator = new ContinuationOrchestrator({
      cli: {
        createProject: async () => ({ ok: true, data: { id: 'should-not-be-created' } as any }),
        listProjects: async () => ({ ok: true, data: [] }),
        acquireSandbox: async () => ({ ok: false, error: { code: 'FAIL', message: 'Fail' } }),
      },
      sshManager: {} as any,
      fileWatcher: {} as any,
      pushToProject: async () => {},
      loadStoredAuth: () => ({ key: 'test', url: 'test' }),
    })

    const newMigration = orchestrator.start('source-reuse')
    expect(newMigration.id).not.toBe(failedMigration.id)
    
    // Check if targetProjectId is reused
    const latest = getLatestMigrationForSource('source-reuse', db)
    expect(latest?.targetProjectId).toBe('target-reuse')
  })
})
