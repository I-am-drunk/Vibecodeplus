import type { Database } from 'bun:sqlite'
import { getDB } from './db.ts'

export type MigrationStatus = 'pending' | 'running' | 'completed' | 'failed' | 'partial_failed'
export type MigrationStage =
  | 'queued'
  | 'creating_target'
  | 'acquiring_target'
  | 'transferring_snapshot'
  | 'verifying_target'
  | 'completed'
  | 'failed'

export type ProjectMigrationRecord = {
  id: string
  sourceProjectId: string
  targetProjectId: string | null
  status: MigrationStatus
  stage: MigrationStage
  stageMessage: string | null
  sourcePreserved: boolean
  errorCode: string | null
  errorMessage: string | null
  warning: string | null
  startedAt: string
  updatedAt: string
  completedAt: string | null
  failedAt: string | null
}

export type ProjectAliasRecord = {
  sourceProjectId: string
  canonicalProjectId: string
  migrationId: string | null
  createdAt: string
  updatedAt: string
}

function dbOrDefault(db?: Database) {
  return db ?? getDB()
}

export function ensureMigrationTables(dbInput?: Database) {
  const db = dbOrDefault(dbInput)

  db.exec(`
    CREATE TABLE IF NOT EXISTS project_migrations (
      id TEXT PRIMARY KEY,
      source_project_id TEXT NOT NULL,
      target_project_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      stage TEXT NOT NULL DEFAULT 'queued',
      stage_message TEXT,
      source_preserved INTEGER NOT NULL DEFAULT 1,
      error_code TEXT,
      error_message TEXT,
      warning TEXT,
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      failed_at DATETIME,
      FOREIGN KEY (source_project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (target_project_id) REFERENCES projects(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS project_aliases (
      source_project_id TEXT PRIMARY KEY,
      canonical_project_id TEXT NOT NULL,
      migration_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (source_project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (canonical_project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (migration_id) REFERENCES project_migrations(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_project_migrations_source ON project_migrations(source_project_id, started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_project_migrations_target ON project_migrations(target_project_id, started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_project_migrations_status ON project_migrations(status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_project_aliases_canonical ON project_aliases(canonical_project_id);
  `)
}

function mapMigrationRow(row: any): ProjectMigrationRecord {
  return {
    id: row.id,
    sourceProjectId: row.source_project_id,
    targetProjectId: row.target_project_id ?? null,
    status: row.status,
    stage: row.stage,
    stageMessage: row.stage_message ?? null,
    sourcePreserved: !!row.source_preserved,
    errorCode: row.error_code ?? null,
    errorMessage: row.error_message ?? null,
    warning: row.warning ?? null,
    startedAt: row.started_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at ?? null,
    failedAt: row.failed_at ?? null,
  }
}

function mapAliasRow(row: any): ProjectAliasRecord {
  return {
    sourceProjectId: row.source_project_id,
    canonicalProjectId: row.canonical_project_id,
    migrationId: row.migration_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function createProjectMigration(sourceProjectId: string, dbInput?: Database): ProjectMigrationRecord {
  const db = dbOrDefault(dbInput)
  const id = crypto.randomUUID()

  db.prepare(`
    INSERT INTO project_migrations (id, source_project_id, status, stage, source_preserved, started_at, updated_at)
    VALUES (?, ?, 'pending', 'queued', 1, datetime('now'), datetime('now'))
  `).run(id, sourceProjectId)

  return getProjectMigration(id, db)!
}

export function getProjectMigration(migrationId: string, dbInput?: Database): ProjectMigrationRecord | null {
  const db = dbOrDefault(dbInput)
  const row = db.prepare('SELECT * FROM project_migrations WHERE id = ?').get(migrationId)
  return row ? mapMigrationRow(row) : null
}

export function getLatestMigrationForSource(sourceProjectId: string, dbInput?: Database): ProjectMigrationRecord | null {
  const db = dbOrDefault(dbInput)
  const row = db.prepare(
    `SELECT * FROM project_migrations WHERE source_project_id = ? ORDER BY started_at DESC LIMIT 1`,
  ).get(sourceProjectId)
  return row ? mapMigrationRow(row) : null
}

export function setMigrationTarget(migrationId: string, targetProjectId: string, dbInput?: Database) {
  const db = dbOrDefault(dbInput)
  db.prepare(
    `UPDATE project_migrations
      SET target_project_id = ?, status = 'running', updated_at = datetime('now')
      WHERE id = ?`,
  ).run(targetProjectId, migrationId)
}

export function setMigrationStage(
  migrationId: string,
  stage: MigrationStage,
  stageMessage?: string,
  dbInput?: Database,
) {
  const db = dbOrDefault(dbInput)
  const status = stage === 'failed' ? 'failed' : stage === 'completed' ? 'completed' : 'running'
  db.prepare(
    `UPDATE project_migrations
      SET stage = ?, stage_message = ?, status = ?, updated_at = datetime('now')
      WHERE id = ?`,
  ).run(stage, stageMessage ?? null, status, migrationId)
}

export function markMigrationCompleted(
  migrationId: string,
  targetProjectId: string,
  opts?: { warning?: string | null; sourcePreserved?: boolean },
  dbInput?: Database,
): ProjectMigrationRecord {
  const db = dbOrDefault(dbInput)
  db.prepare(`
    UPDATE project_migrations
    SET
      target_project_id = ?,
      status = 'completed',
      stage = 'completed',
      warning = ?,
      source_preserved = ?,
      error_code = NULL,
      error_message = NULL,
      completed_at = datetime('now'),
      updated_at = datetime('now')
    WHERE id = ?
  `).run(targetProjectId, opts?.warning ?? null, opts?.sourcePreserved === false ? 0 : 1, migrationId)

  return getProjectMigration(migrationId, db)!
}

export function markMigrationFailed(
  migrationId: string,
  options: {
    errorCode: string
    errorMessage: string
    stage?: MigrationStage
    partial?: boolean
    warning?: string | null
    sourcePreserved?: boolean
    targetProjectId?: string | null
  },
  dbInput?: Database,
): ProjectMigrationRecord {
  const db = dbOrDefault(dbInput)
  const stage = options.stage ?? 'failed'
  const status: MigrationStatus = options.partial ? 'partial_failed' : 'failed'

  db.prepare(`
    UPDATE project_migrations
    SET
      target_project_id = COALESCE(?, target_project_id),
      status = ?,
      stage = ?,
      source_preserved = ?,
      warning = ?,
      error_code = ?,
      error_message = ?,
      failed_at = datetime('now'),
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    options.targetProjectId ?? null,
    status,
    stage,
    options.sourcePreserved === false ? 0 : 1,
    options.warning ?? null,
    options.errorCode,
    options.errorMessage,
    migrationId,
  )

  return getProjectMigration(migrationId, db)!
}

export function upsertProjectAlias(
  sourceProjectId: string,
  canonicalProjectId: string,
  migrationId?: string,
  dbInput?: Database,
): ProjectAliasRecord {
  const db = dbOrDefault(dbInput)

  db.prepare(`
    INSERT INTO project_aliases (source_project_id, canonical_project_id, migration_id, created_at, updated_at)
    VALUES (?, ?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(source_project_id) DO UPDATE SET
      canonical_project_id = excluded.canonical_project_id,
      migration_id = excluded.migration_id,
      updated_at = datetime('now')
  `).run(sourceProjectId, canonicalProjectId, migrationId ?? null)

  return getProjectAlias(sourceProjectId, db)!
}

export function getProjectAlias(sourceProjectId: string, dbInput?: Database): ProjectAliasRecord | null {
  const db = dbOrDefault(dbInput)
  const row = db.prepare('SELECT * FROM project_aliases WHERE source_project_id = ?').get(sourceProjectId)
  return row ? mapAliasRow(row) : null
}

export function resolveCanonicalProjectId(
  projectId: string,
  dbInput?: Database,
): {
  canonicalProjectId: string
  mappedFromProjectId: string | null
  aliasChain: string[]
} {
  const db = dbOrDefault(dbInput)

  const seen = new Set<string>()
  const chain: string[] = []

  let current = projectId
  let mappedFrom: string | null = null

  while (!seen.has(current)) {
    seen.add(current)
    const alias = getProjectAlias(current, db)
    if (!alias || alias.canonicalProjectId === current) break

    chain.push(alias.canonicalProjectId)
    if (!mappedFrom) mappedFrom = projectId
    current = alias.canonicalProjectId
  }

  return {
    canonicalProjectId: current,
    mappedFromProjectId: mappedFrom,
    aliasChain: chain,
  }
}

export function listHiddenSourceProjectIds(dbInput?: Database): string[] {
  const db = dbOrDefault(dbInput)
  const rows = db.prepare('SELECT source_project_id FROM project_aliases').all() as Array<{ source_project_id: string }>
  return rows.map((row) => row.source_project_id)
}
