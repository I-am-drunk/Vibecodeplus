import { Hono } from 'hono'
import { createHash } from 'crypto'
import { cli } from '../cli/wrapper.ts'
import { getDB } from '../state/db.ts'
import { loadStoredAuth } from '../state/auth.ts'
import { sshManager } from '../ssh/manager.ts'
import { captureNow, pushToProject } from '../continuation/capture.ts'
import { createLogger } from '../lib/logger.ts'
import { fileWatcher } from '../ssh/watcher.ts'
import {
  getLatestMigrationForSource,
  getProjectMigration,
  resolveCanonicalProjectId,
  cancelMigration,
} from '../state/migrations.ts'
import { continuationOrchestrator } from '../continuation/orchestrator.ts'
import { parseContinuationEnactRequest, readBody } from '../contracts/routes.ts'
import { AppError, badRequest, jsonError, notFound, success, unauthorized } from '../lib/errors.ts'
import { agentUrls } from '../state/agents.ts'
import { normalizeAgentUrl } from '../lib/agent-url.ts'
import { mapGetUserFailure } from '../lib/errors.ts'
import { featureFlags } from '../lib/flags.ts'
import { getCorrelation, updateCorrelation } from '../lib/correlation.ts'
import { isMigrationTerminal } from '../services/migrationService.ts'

const log = createLogger('continuation')

export const continuationRouter = new Hono()

type ProjectRow = {
  id: string
  name: string
  description: string | null
  default_model: string | null
  api_key_hash: string | null
  snapshot_dir: string | null
  snapshot_at: string | null
}

function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex').slice(0, 16)
}

function serializeMigration(migration: ReturnType<typeof getProjectMigration>) {
  if (!migration) return null

  return {
    id: migration.id,
    sourceProjectId: migration.sourceProjectId,
    targetProjectId: migration.targetProjectId,
    status: migration.status,
    stage: migration.stage,
    stageMessage: migration.stageMessage,
    sourcePreserved: migration.sourcePreserved,
    warning: migration.warning,
    errorCode: migration.errorCode,
    errorMessage: migration.errorMessage,
    startedAt: migration.startedAt,
    updatedAt: migration.updatedAt,
    completedAt: migration.completedAt,
    failedAt: migration.failedAt,
    isTerminal: isMigrationTerminal(migration.status),
  }
}

continuationRouter.get('/status/:projectId', (c) => {
  try {
    const projectId = c.req.param('projectId')
    if (!projectId) throw badRequest('projectId is required')

    const db = getDB()
    const resolved = resolveCanonicalProjectId(projectId)

    const requestedRow = db
      .prepare('SELECT api_key_hash, snapshot_dir, snapshot_at FROM projects WHERE id = ?')
      .get(projectId) as { api_key_hash: string | null; snapshot_dir: string | null; snapshot_at: string | null } | undefined

    const canonicalRow = db
      .prepare('SELECT api_key_hash, snapshot_dir, snapshot_at FROM projects WHERE id = ?')
      .get(resolved.canonicalProjectId) as
      | { api_key_hash: string | null; snapshot_dir: string | null; snapshot_at: string | null }
      | undefined

    if (!requestedRow && !canonicalRow) throw notFound('Project not found')

    const row = requestedRow ?? canonicalRow!

    const auth = loadStoredAuth()
    const currentHash = auth?.key ? hashKey(auth.key) : null
    const needsContinuation =
      !resolved.mappedFromProjectId && !!(row.api_key_hash && currentHash && row.api_key_hash !== currentHash)

    const latestMigration = getLatestMigrationForSource(projectId)

    return c.json(
      success({
        snapshotDir: row.snapshot_dir,
        snapshotAt: row.snapshot_at,
        needsContinuation,
        canonicalProjectId: resolved.canonicalProjectId,
        mappedFromProjectId: resolved.mappedFromProjectId,
        migration: latestMigration ? serializeMigration(latestMigration) : null,
      }),
    )
  } catch (error) {
    return jsonError(c, error)
  }
})

continuationRouter.get('/migrations/:migrationId', (c) => {
  try {
    const migrationId = c.req.param('migrationId')
    if (!migrationId) throw badRequest('migrationId is required')

    const migration = getProjectMigration(migrationId)
    if (!migration) throw notFound('Migration not found', { migrationId })

    return c.json(success({ migration: serializeMigration(migration) }))
  } catch (error) {
    return jsonError(c, error)
  }
})

continuationRouter.post('/capture/:projectId', async (c) => {
  try {
    const projectId = c.req.param('projectId')
    if (!projectId) throw badRequest('projectId is required')

    const resolved = resolveCanonicalProjectId(projectId)
    const count = await captureNow(resolved.canonicalProjectId)

    return c.json(success({ ok: true, fileCount: count, canonicalProjectId: resolved.canonicalProjectId }))
  } catch (error) {
    return jsonError(c, error)
  }
})

continuationRouter.post('/enact', async (c) => {
  try {
    const body = await parseContinuationEnactRequest(await readBody(c))

    const db = getDB()
    const source = db.prepare('SELECT * FROM projects WHERE id = ?').get(body.sourceProjectId) as ProjectRow | undefined
    if (!source) throw notFound('Source project not found')

    const auth = loadStoredAuth()
    if (!auth?.key) throw unauthorized('No API key configured')

    if (!featureFlags.migration_v2) {
      const legacyResult = await runLegacyEnact(body.sourceProjectId, source, auth.key)
      return c.json(success(legacyResult))
    }

    const migration = continuationOrchestrator.start(body.sourceProjectId)

    // Enrich correlation context with migration_id and project_id
    updateCorrelation({ projectId: body.sourceProjectId, migrationId: migration.id })
    const correlation = getCorrelation()

    const statusCode = migration.status === 'completed' ? 200 : 202

    return c.json(
      success({
        ok: true,
        requestId: correlation.requestId,
        migration: serializeMigration(migration),
      }),
      statusCode,
    )
  } catch (error) {
    return jsonError(c, error)
  }
})

async function runLegacyEnact(sourceProjectId: string, source: ProjectRow, authKey: string) {
  const continuationName = source.name || 'Continued Project'
  const continuationDescription = source.description || continuationName

  const createResult = await cli.createProject(continuationName, {
    description: continuationDescription,
  })

  if (!createResult.ok) {
    throw new AppError('DEPENDENCY_ERROR', createResult.error.message || 'Failed to create continuation project', 502)
  }

  const newProjectId = createResult.data.id

  const verify = await cli.listProjects()
  if (verify.ok) {
    const exists = verify.data.some((project) => project.id === newProjectId)
    if (!exists) {
      throw new AppError('MIGRATION_FAILED', 'Project creation could not be verified. Please try again.', 500)
    }
  }

  const db = getDB()

  db.prepare(`
    INSERT INTO projects (id, name, description, default_model, api_key_hash, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      description = excluded.description,
      default_model = excluded.default_model,
      api_key_hash = excluded.api_key_hash,
      updated_at = datetime('now')
  `).run(newProjectId, continuationName, continuationDescription, source.default_model || 'claude-sonnet-4-6', hashKey(authKey))

  let fileTransferWarning: string | null = null
  let sourcePreserved = true

  const sandboxResult = await cli.acquireSandbox(newProjectId)
  if (!sandboxResult.ok) {
    throw mapGetUserFailure(sandboxResult.error)
  }

  const sandbox = sandboxResult.data.sandbox
  const links = sandboxResult.data.links as any

  const acquiredAgentUrl = normalizeAgentUrl(
    typeof links?.agentUrl === 'string' ? links.agentUrl : (links?.agentUrl?.url as unknown),
  )

  sshManager.primeCredentials(newProjectId, sandbox)
  await sshManager.getConnection(newProjectId)

  if (acquiredAgentUrl) {
    agentUrls.set(newProjectId, acquiredAgentUrl)
  }

  if (source.snapshot_dir) {
    try {
      await pushToProject(sourceProjectId, newProjectId)
    } catch (error) {
      fileTransferWarning = error instanceof Error ? error.message : String(error)
      log.warn({ sourceProjectId, newProjectId, warning: fileTransferWarning }, 'snapshot push failed in legacy mode')
    }
  }

  fileWatcher.stop(sourceProjectId)
  await sshManager.closeConnection(sourceProjectId).catch(() => {})
  agentUrls.delete(sourceProjectId)

  return {
    newProjectId,
    name: continuationName,
    warning: fileTransferWarning,
    sourcePreserved,
  }
}

// QA-064: Cancel a running migration
continuationRouter.post('/cancel', async (c) => {
  try {
    const body = await readBody(c) as Record<string, unknown>
    const migrationId = typeof body?.migrationId === 'string' ? body.migrationId.trim() : ''
    if (!migrationId) throw badRequest('migrationId is required')

    const result = cancelMigration(migrationId)
    if (!result) {
      throw badRequest('Migration not found or not in a cancellable state')
    }

    return c.json(success({
      migration: {
        id: result.id,
        status: result.status,
        stage: result.stage,
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
        sourcePreserved: result.sourcePreserved,
      },
    }))
  } catch (error) {
    return jsonError(c, error)
  }
})
