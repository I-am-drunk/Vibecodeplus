import { Hono } from 'hono'
import { createHash } from 'crypto'
import { cli } from '../cli/wrapper.ts'
import { getDB } from '../state/db.ts'
import { loadStoredAuth } from '../state/auth.ts'
import { sshManager } from '../ssh/manager.ts'
import { backupCoordinator } from '../backup/coordinator.ts'
import { createLogger } from '../lib/logger.ts'
import { fileWatcher } from '../ssh/watcher.ts'
import {
  getLatestMigrationForSource,
  resolveCanonicalProjectId,
  upsertProjectAlias,
} from '../state/migrations.ts'
import {
  badRequest,
  dependencyError,
  jsonError,
  notFound,
  success,
  forbidden,
  AppError,
  migrationInProgress,
} from '../lib/errors.ts'
import {
  parseCreateProjectRequest,
  parsePatchProjectRequest,
  readBody,
} from '../contracts/routes.ts'
import { agentUrls } from '../state/agents.ts'

const log = createLogger('projects')

export const projectsRouter = new Hono()

type ProjectRow = {
  id: string
  name: string
  description: string | null
  default_model: string | null
  last_opened_at: string | null
  api_key_hash: string | null
  snapshot_at: string | null
  created_at: string
  updated_at: string
}

function hashKey(key: string) {
  return createHash('sha256').update(key).digest('hex').slice(0, 16)
}

function getCurrentAuthHash() {
  const auth = loadStoredAuth()
  return auth?.key ? hashKey(auth.key) : null
}

function toProjectResponse(row: ProjectRow, remote?: any, currentHash?: string | null) {
  const differentKey = !!(row.api_key_hash && currentHash && row.api_key_hash !== currentHash)

  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    sandbox: remote?.sandbox || { status: 'stopped' },
    defaultModel: row.default_model ?? 'claude-sonnet-4-6',
    lastOpenedAt: row.last_opened_at ?? null,
    snapshotAt: row.snapshot_at ?? null,
    differentKey,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

function resolveRequestedProject(projectId: string) {
  const resolved = resolveCanonicalProjectId(projectId)
  return {
    canonicalProjectId: resolved.canonicalProjectId,
    mappedFromProjectId: resolved.mappedFromProjectId,
  }
}

async function listRemoteProjectsSafe() {
  const result = await cli.listProjects()
  if (!result.ok) {
    log.warn({ error: result.error.message }, 'failed to list remote projects')
    return new Map<string, any>()
  }

  return new Map(result.data.map((project) => [project.id, project]))
}

projectsRouter.get('/', async (c) => {
  try {
    const db = getDB()
    const currentHash = getCurrentAuthHash()

    const rows = db.prepare(`
      SELECT p.*
      FROM projects p
      LEFT JOIN project_aliases a ON a.source_project_id = p.id
      WHERE a.source_project_id IS NULL
      ORDER BY COALESCE(p.last_opened_at, p.created_at) DESC
    `).all() as ProjectRow[]

    const remoteProjects = await listRemoteProjectsSafe()
    const projects = rows.map((row) => toProjectResponse(row, remoteProjects.get(row.id), currentHash))

    return c.json(success({ projects }))
  } catch (error) {
    return jsonError(c, error)
  }
})

projectsRouter.post('/', async (c) => {
  try {
    const body = await parseCreateProjectRequest(await readBody(c))

    const createResult = await cli.createProject(body.name, {
      description: body.description,
      template: body.template,
    })

    if (!createResult.ok) {
      throw dependencyError(createResult.error.message || 'Failed to create project', {
        dependencyCode: createResult.error.code,
      })
    }

    const db = getDB()
    const currentHash = getCurrentAuthHash()

    db.prepare(`
      INSERT INTO projects (id, name, description, default_model, api_key_hash, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        description = excluded.description,
        default_model = excluded.default_model,
        api_key_hash = excluded.api_key_hash,
        updated_at = datetime('now')
    `).run(
      createResult.data.id,
      body.name,
      body.description ?? null,
      body.defaultModel ?? 'claude-sonnet-4-6',
      currentHash,
    )

    const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(createResult.data.id) as ProjectRow
    return c.json(success({ project: toProjectResponse(row, createResult.data, currentHash) }), 201)
  } catch (error) {
    return jsonError(c, error)
  }
})

projectsRouter.get('/:id', async (c) => {
  try {
    const requestedId = c.req.param('id')
    if (!requestedId) throw badRequest('Project id is required')

    const { canonicalProjectId, mappedFromProjectId } = resolveRequestedProject(requestedId)
    const db = getDB()

    const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(canonicalProjectId) as ProjectRow | undefined
    if (!row) throw notFound('Project not found', { projectId: canonicalProjectId })

    const remoteProjects = await listRemoteProjectsSafe()
    const project = toProjectResponse(row, remoteProjects.get(canonicalProjectId), getCurrentAuthHash())
    return c.json(success({ project, canonicalProjectId, mappedFromProjectId }))
  } catch (error) {
    return jsonError(c, error)
  }
})

projectsRouter.patch('/:id', async (c) => {
  try {
    const requestedId = c.req.param('id')
    if (!requestedId) throw badRequest('Project id is required')

    const { canonicalProjectId } = resolveRequestedProject(requestedId)
    const body = await parsePatchProjectRequest(await readBody(c))

    const db = getDB()
    const result = db.prepare(`
      UPDATE projects
      SET default_model = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(body.defaultModel, canonicalProjectId)

    if (result.changes === 0) {
      throw notFound('Project not found', { projectId: canonicalProjectId })
    }

    return c.json(success({ ok: true }))
  } catch (error) {
    return jsonError(c, error)
  }
})

projectsRouter.delete('/:id', async (c) => {
  try {
    const requestedId = c.req.param('id')
    if (!requestedId) throw badRequest('Project id is required')

    const { canonicalProjectId } = resolveRequestedProject(requestedId)

    const remoteDelete = await cli.deleteProject(canonicalProjectId)

    if (!remoteDelete.ok) {
      const message = remoteDelete.error.message?.toLowerCase() ?? ''
      const ignorable = message.includes('not found') || message.includes('forbidden')
      if (!ignorable) {
        log.warn({ projectId: canonicalProjectId, error: remoteDelete.error.message }, 'remote delete failed')
      }
    }

    await sshManager.disconnect(canonicalProjectId).catch(() => {})
    fileWatcher.stop(canonicalProjectId)
    agentUrls.delete(canonicalProjectId)

    const db = getDB()
    db.prepare('DELETE FROM projects WHERE id = ?').run(canonicalProjectId)
    db.prepare('DELETE FROM sessions WHERE project_id = ?').run(canonicalProjectId)

    return c.json(success({ ok: true }))
  } catch (error) {
    return jsonError(c, error)
  }
})

projectsRouter.post('/:id/workspace', async (c) => {
  try {
    const requestedProjectId = c.req.param('id')
    if (!requestedProjectId || requestedProjectId === 'null' || requestedProjectId === 'undefined') {
      throw badRequest('Invalid project ID')
    }

    const latestMigration = getLatestMigrationForSource(requestedProjectId)
    if (latestMigration && (latestMigration.status === 'pending' || latestMigration.status === 'running')) {
      throw migrationInProgress('Migration is currently in progress for this project', {
        migrationId: latestMigration.id,
        stage: latestMigration.stage,
        status: latestMigration.status,
        targetProjectId: latestMigration.targetProjectId,
      })
    }

    if (latestMigration?.status === 'completed' && latestMigration.targetProjectId) {
      upsertProjectAlias(requestedProjectId, latestMigration.targetProjectId, latestMigration.id)
    }

    const resolved = resolveRequestedProject(requestedProjectId)
    const projectId = resolved.canonicalProjectId

    const db = getDB()
    const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as ProjectRow | undefined
    if (!row) {
      throw notFound('Project not found. Projects must be created through this studio.', { projectId })
    }

    const existingConnection = sshManager.isConnected(projectId)
    const existingAgentUrl = agentUrls.get(projectId)
    if (existingConnection && existingAgentUrl) {
      db.prepare(`UPDATE projects SET last_opened_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`).run(projectId)
      return c.json(
        success({
          ok: true,
          agentUrl: existingAgentUrl,
          canonicalProjectId: projectId,
          mappedFromProjectId: resolved.mappedFromProjectId,
        }),
      )
    }

    db.prepare(`UPDATE projects SET last_opened_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`).run(projectId)

    const acquire = await cli.acquireSandbox(projectId)
    if (!acquire.ok) {
      const message = acquire.error.message || 'Failed to acquire sandbox'

      if (acquire.error.code === 'CREDITS_EXHAUSTED') {
        throw new AppError('CREDITS_EXHAUSTED', 'Insufficient credits. Add credits at vibecode.dev/payments', 402)
      }

      if (acquire.error.code === 'AUTH_FAILED' || message.toLowerCase().includes('forbidden')) {
        const remote = await cli.listProjects()
        const existsRemotely = remote.ok && remote.data.some((project) => project.id === projectId)
        if (!existsRemotely) {
          return c.json(
            success({
              ok: false,
              differentKey: true,
              snapshotAt: row.snapshot_at ?? null,
              canonicalProjectId: projectId,
              mappedFromProjectId: resolved.mappedFromProjectId,
            }),
          )
        }

        throw forbidden('API key is invalid or account is restricted. Please update your API key in Settings.', {
          reason: 'FORBIDDEN',
        })
      }

      throw dependencyError(message, { dependencyCode: acquire.error.code })
    }

    const sandbox = acquire.data.sandbox
    const links = acquire.data.links as any

    sshManager.primeCredentials(projectId, sandbox)

    try {
      await sshManager.getConnection(projectId)
    } catch (error) {
      throw dependencyError(`SSH connect failed: ${error instanceof Error ? error.message : String(error)}`)
    }

    if (links?.agentUrl?.url) {
      agentUrls.set(projectId, String(links.agentUrl.url))
    }

    const currentHash = getCurrentAuthHash()
    if (currentHash) {
      db.prepare(`UPDATE projects SET api_key_hash = ?, updated_at = datetime('now') WHERE id = ?`).run(currentHash, projectId)
    }

    try {
      await backupCoordinator.restoreLatest(projectId)
    } catch (error) {
      log.warn({ projectId, error: String(error) }, 'failed to restore latest backup')
    }

    return c.json(
      success({
        ok: true,
        sandbox: {
          host: sandbox?.host,
          port: sandbox?.port,
          user: sandbox?.user,
        },
        agentUrl: links?.agentUrl?.url,
        links,
        canonicalProjectId: projectId,
        mappedFromProjectId: resolved.mappedFromProjectId,
      }),
    )
  } catch (error) {
    return jsonError(c, error)
  }
})

projectsRouter.delete('/:id/workspace', async (c) => {
  try {
    const requestedProjectId = c.req.param('id')
    if (!requestedProjectId) throw badRequest('Project id is required')

    const { canonicalProjectId } = resolveRequestedProject(requestedProjectId)

    await sshManager.disconnect(canonicalProjectId).catch(() => {})
    fileWatcher.stop(canonicalProjectId)
    agentUrls.delete(canonicalProjectId)

    return c.json(success({ ok: true }))
  } catch (error) {
    return jsonError(c, error)
  }
})
