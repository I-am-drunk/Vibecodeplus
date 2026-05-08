import { Hono } from 'hono'
import { createHash } from 'crypto'
import { cli } from '../cli/wrapper.ts'
import { getDB } from '../state/db.ts'
import { loadStoredAuth } from '../state/auth.ts'
import { sshManager } from '../ssh/manager.ts'
import { backupCoordinator } from '../backup/coordinator.ts'
import { createLogger } from '../lib/logger.ts'
import { fileWatcher } from '../ssh/watcher.ts'

const log = createLogger('projects')

export const agentUrls = new Map<string, string>()

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

async function listRemoteProjectsSafe() {
  const result = await cli.listProjects()
  if (!result.ok) {
    log.warn({ error: result.error.message }, 'failed to list remote projects')
    return new Map<string, any>()
  }

  return new Map(result.data.map((project: any) => [project.id, project]))
}

projectsRouter.get('/', async (c) => {
  const db = getDB()
  const currentHash = getCurrentAuthHash()

  const rows = db.prepare(`
    SELECT * FROM projects
    ORDER BY COALESCE(last_opened_at, created_at) DESC
  `).all() as ProjectRow[]

  const remoteProjects = await listRemoteProjectsSafe()
  const projects = rows.map((row) => toProjectResponse(row, remoteProjects.get(row.id), currentHash))

  return c.json({ projects })
})

projectsRouter.post('/', async (c) => {
  const body = await c.req.json<{ name?: string; description?: string; template?: string; defaultModel?: string }>()
  const name = body.name?.trim()

  if (!name) return c.json({ error: 'name is required' }, 400)

  const createResult = await cli.createProject(name, {
    description: body.description,
    template: body.template,
  })

  if (!createResult.ok) {
    return c.json({ error: createResult.error.message || 'Failed to create project' }, 500)
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
    name,
    body.description ?? null,
    body.defaultModel ?? 'claude-sonnet-4-6',
    currentHash,
  )

  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(createResult.data.id) as ProjectRow
  return c.json({ project: toProjectResponse(row, createResult.data, currentHash) }, 201)
})

projectsRouter.get('/:id', async (c) => {
  const projectId = c.req.param('id')
  const db = getDB()
  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as ProjectRow | undefined

  if (!row) return c.json({ error: 'project not found' }, 404)

  const remoteProjects = await listRemoteProjectsSafe()
  const project = toProjectResponse(row, remoteProjects.get(projectId), getCurrentAuthHash())
  return c.json({ project })
})

projectsRouter.patch('/:id', async (c) => {
  const projectId = c.req.param('id')
  const { defaultModel } = await c.req.json<{ defaultModel?: string }>()

  if (!defaultModel?.trim()) {
    return c.json({ error: 'defaultModel is required' }, 400)
  }

  const db = getDB()
  db.prepare(`
    UPDATE projects
    SET default_model = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(defaultModel.trim(), projectId)

  return c.json({ ok: true })
})

projectsRouter.delete('/:id', async (c) => {
  const projectId = c.req.param('id')
  const remoteDelete = await cli.deleteProject(projectId)

  if (!remoteDelete.ok) {
    const message = remoteDelete.error.message?.toLowerCase() ?? ''
    const ignorable = message.includes('not found') || message.includes('forbidden')
    if (!ignorable) {
      log.warn({ projectId, error: remoteDelete.error.message }, 'remote delete failed')
    }
  }

  await sshManager.disconnect(projectId).catch(() => {})
  fileWatcher.stop(projectId)
  agentUrls.delete(projectId)

  const db = getDB()
  db.prepare('DELETE FROM projects WHERE id = ?').run(projectId)
  db.prepare('DELETE FROM sessions WHERE project_id = ?').run(projectId)

  return c.json({ ok: true })
})

projectsRouter.post('/:id/workspace', async (c) => {
  const projectId = c.req.param('id')
  if (!projectId || projectId === 'null' || projectId === 'undefined') {
    return c.json({ error: 'Invalid project ID' }, 400)
  }

  const db = getDB()
  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as ProjectRow | undefined
  if (!row) {
    return c.json({ error: 'Project not found. Projects must be created through this studio.' }, 404)
  }

  const existingConnection = sshManager.isConnected(projectId)
  const existingAgentUrl = agentUrls.get(projectId)
  if (existingConnection && existingAgentUrl) {
    db.prepare(`UPDATE projects SET last_opened_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`).run(projectId)
    return c.json({ ok: true, agentUrl: existingAgentUrl })
  }

  db.prepare(`UPDATE projects SET last_opened_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`).run(projectId)

  const acquire = await cli.acquireSandbox(projectId)
  if (!acquire.ok) {
    const message = acquire.error.message || 'Failed to acquire sandbox'

    if (acquire.error.code === 'CREDITS_EXHAUSTED') {
      return c.json({ error: 'Insufficient credits. Add credits at vibecode.dev/payments' }, 402)
    }

    if (message.toLowerCase().includes('forbidden')) {
      const remote = await cli.listProjects()
      const existsRemotely = remote.ok && remote.data.some((project: any) => project.id === projectId)
      if (!existsRemotely) {
        return c.json({ ok: false, differentKey: true, snapshotAt: row.snapshot_at ?? null })
      }

      return c.json(
        {
          error: 'API key is invalid or account is restricted. Please update your API key in Settings.',
          code: 'FORBIDDEN',
        },
        403,
      )
    }

    return c.json({ error: message }, 500)
  }

  const sandbox = acquire.data.sandbox
  const links = acquire.data.links

  sshManager.primeCredentials(projectId, sandbox)

  try {
    await sshManager.getConnection(projectId)
  } catch (err) {
    return c.json({ error: `SSH connect failed: ${err instanceof Error ? err.message : String(err)}` }, 500)
  }

  if (links?.agentUrl?.url) {
    agentUrls.set(projectId, links.agentUrl.url)
  }

  const currentHash = getCurrentAuthHash()
  if (currentHash) {
    db.prepare(`UPDATE projects SET api_key_hash = ?, updated_at = datetime('now') WHERE id = ?`).run(currentHash, projectId)
  }

  try {
    await backupCoordinator.restoreLatest(projectId)
  } catch (err) {
    log.warn({ projectId, error: String(err) }, 'failed to restore latest backup')
  }

  return c.json({
    ok: true,
    sandbox: {
      host: sandbox?.ipv4,
      port: sandbox?.sshPort,
      user: sandbox?.sshUsername,
    },
    agentUrl: links?.agentUrl?.url,
    links,
  })
})

projectsRouter.delete('/:id/workspace', async (c) => {
  const projectId = c.req.param('id')
  await sshManager.disconnect(projectId).catch(() => {})
  fileWatcher.stop(projectId)
  agentUrls.delete(projectId)
  return c.json({ ok: true })
})
