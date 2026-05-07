import { Hono } from 'hono'
import { createHash } from 'crypto'
import { cli } from '../cli/wrapper.ts'
import { getDB } from '../state/db.ts'
import { loadStoredAuth } from '../state/auth.ts'
import { sshManager } from '../ssh/manager.ts'
import { backupCoordinator } from '../backup/coordinator.ts'
import { wsHub as hub } from '../ws/hub.ts'
import { createLogger } from '../lib/logger.ts'

function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex').slice(0, 16)
}

const log = createLogger('projects')

// Server-side agentUrl store — always fresh from last openWorkspace
export const agentUrls = new Map<string, string>()

export const projectsRouter = new Hono()

projectsRouter.get('/', async (c) => {
  log.debug({}, 'listing projects - from local database')
  const db = getDB()

  // Get ONLY projects that were created locally (exist in our DB)
  const localProjects = db.prepare(`
    SELECT * FROM projects ORDER BY last_opened_at DESC NULLS LAST, created_at DESC
  `).all() as any[]

  log.debug({ count: localProjects.length }, 'found local projects')

  // Enrich with CLI data for projects that still exist on the API
  const cliResult = await cli.listProjects()
  const remoteProjects = new Map()
  if (cliResult.ok) {
    for (const p of cliResult.data) {
      remoteProjects.set(p.id, p)
    }
  }

  const projects = localProjects.map((p) => {
    const remote = remoteProjects.get(p.id)
    log.trace({ projectId: p.id, existsRemote: !!remote }, 'enriching project')
    return {
      id: p.id,
      name: p.name,
      description: p.description,
      sandbox: remote?.sandbox || { status: 'stopped' },
      defaultModel: p.default_model ?? 'claude-sonnet-4-6',
      lastOpenedAt: p.last_opened_at ?? null,
      differentKey: false,
      created_at: p.created_at,
      updated_at: p.updated_at,
    }
  })

  log.info({ count: projects.length }, 'projects listed successfully')
  return c.json({ projects })
})

projectsRouter.post('/', async (c) => {
  const body = await c.req.json()
  const { name, description, template, defaultModel } = body
  log.info({ name, template, hasDescription: !!description }, 'creating new project')
  if (!name?.trim()) {
    log.warn({}, 'project creation failed - name required')
    return c.json({ error: 'name is required' }, 400)
  }

  const result = await cli.createProject(name.trim(), { description, template })
  if (!result.ok) return c.json({ error: result.error }, 500)

  const db = getDB()
  const keyHashCreate = (() => { const a = loadStoredAuth(); return a?.key ? hashKey(a.key) : null })()
  db.prepare(`
    INSERT OR REPLACE INTO projects (id, name, description, default_model, api_key_hash)
    VALUES (?, ?, ?, ?, ?)
  `).run(result.data.id, name.trim(), description ?? null, defaultModel ?? 'claude-sonnet-4-6', keyHashCreate)

  return c.json({ project: { ...result.data, defaultModel } }, 201)
})

projectsRouter.get('/:id', async (c) => {
  const projectId = c.req.param('id')
  const db = getDB()
  const local = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as any

  if (!local) return c.json({ error: 'project not found' }, 404)

  // Enrich with CLI data if it exists on the API
  const cliResult = await cli.listProjects()
  const remote = cliResult.ok ? cliResult.data.find((p) => p.id === projectId) : null

  return c.json({
    project: {
      id: local.id,
      name: local.name,
      description: local.description,
      sandbox: remote?.sandbox || { status: 'stopped' },
      defaultModel: local.default_model ?? 'claude-sonnet-4-6',
      lastOpenedAt: local.last_opened_at ?? null,
      differentKey: false,
      created_at: local.created_at,
      updated_at: local.updated_at,
    },
  })
})

projectsRouter.patch('/:id', async (c) => {
  const projectId = c.req.param('id')
  const { defaultModel } = await c.req.json()
  const db = getDB()
  db.prepare(`
    INSERT OR REPLACE INTO projects (id, default_model)
    VALUES (?, ?)
    ON CONFLICT(id) DO UPDATE SET default_model = excluded.default_model
  `).run(projectId, defaultModel)
  return c.json({ ok: true })
})

projectsRouter.delete('/:id', async (c) => {
  const projectId = c.req.param('id')
  const result = await cli.deleteProject(projectId)
  if (!result.ok) return c.json({ error: result.error }, 500)

  // clean up SSH + DB records
  await sshManager.disconnect(projectId).catch(() => {})
  const db = getDB()
  db.prepare('DELETE FROM projects WHERE id = ?').run(projectId)
  db.prepare('DELETE FROM sessions WHERE project_id = ?').run(projectId)

  return c.json({ ok: true })
})

// POST /projects/:id/workspace — acquire sandbox and open SSH
projectsRouter.post('/:id/workspace', async (c) => {
  const projectId = c.req.param('id')
  
  // Reject null/invalid projectIds immediately
  if (!projectId || projectId === 'null' || projectId === 'undefined') {
    log.warn({ projectId }, 'workspace open rejected - invalid projectId')
    return c.json({ error: 'Invalid project ID' }, 400)
  }
  
  log.info({ projectId }, 'opening workspace - acquiring sandbox')

  // Only allow opening workspaces for locally-created projects
  const db = getDB()
  const existing = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId)
  if (!existing) {
    log.warn({ projectId }, 'workspace open rejected - project not in local database')
    return c.json({ error: 'Project not found. Projects must be created through this studio.' }, 404)
  }

  // mark last opened
  db.prepare(`UPDATE projects SET last_opened_at = datetime('now') WHERE id = ?`).run(projectId)
  log.debug({ projectId }, 'updated last opened timestamp')

  log.debug({ projectId }, 'calling CLI acquireSandbox')
  const result = await cli.acquireSandbox(projectId)
  if (!result.ok) {
    log.error({ projectId, error: result.error }, 'failed to acquire sandbox')
    
    // Check for specific error types
    if (result.error.code === 'CREDITS_EXHAUSTED') {
      return c.json({ error: 'Insufficient credits. Add credits at vibecode.dev/payments' }, 402)
    }
    
    // Check if Forbidden — project may have been created with a different key
    if (result.error.message?.includes('Forbidden') || result.error.stderr?.includes('Forbidden')) {
      // Check if this project exists under the current API key
      const remoteList = await cli.listProjects()
      const existsRemotely = remoteList.ok && remoteList.data.some((p: any) => p.id === projectId)
      if (!existsRemotely) {
        // Project belongs to a different key — trigger continuation flow on the client
        const dbRow = db.prepare('SELECT snapshot_at FROM projects WHERE id = ?').get(projectId) as any
        log.info({ projectId }, 'project not found under current key — activating continuation flow')
        return c.json({ differentKey: true, snapshotAt: dbRow?.snapshot_at ?? null })
      }
      return c.json({ 
        error: 'API key is invalid or account is restricted. Please update your API key in Settings.',
        code: 'FORBIDDEN'
      }, 403)
    }
    
    return c.json({ error: result.error.message || 'Failed to acquire sandbox' }, 500)
  }

  const { sandbox: creds, links } = result.data
  log.info({ projectId, sandboxId: creds.id, host: creds.ipv4, port: creds.sshPort, agentUrl: links?.agentUrl?.url }, 'sandbox acquired successfully')
  log.trace({ projectId, credentials: creds, links }, 'full sandbox response')
  
  log.debug({ projectId }, 'establishing SSH connection')
  try {
    await sshManager.getConnection(projectId)
    log.info({ projectId }, 'SSH connection established')
  } catch (err) {
    log.error({ projectId, err }, 'SSH connection failed')
    return c.json({ error: `SSH connect failed: ${err instanceof Error ? err.message : String(err)}` }, 500)
  }

  // Restore workspace files from latest backup if available
  try {
    const latestBackup = backupCoordinator.getLatestBackup(projectId)
    if (latestBackup) {
      log.info({ projectId, backupId: latestBackup.id, backupPath: latestBackup.file_path }, 'restoring workspace from backup')
      const sftp = await sshManager.getSFTP(projectId)

      // Upload backup tarball to sandbox
      const remotePath = `/tmp/workspace_restore.tar.gz`
      await new Promise<void>((resolve, reject) => {
        sftp.fastPut(latestBackup.file_path, remotePath, {}, (err) => {
          if (err) reject(err)
          else resolve()
        })
      })
      log.debug({ projectId }, 'backup uploaded to sandbox')

      // Extract in sandbox home directory
      await sshManager.exec(projectId, `mkdir -p /home/user && cd /home/user && tar xzf ${remotePath} --strip-components=1 2>/dev/null || tar xzf ${remotePath} 2>/dev/null || true`)
      await sshManager.exec(projectId, `rm -f ${remotePath}`)
      log.info({ projectId }, 'workspace files restored from backup')
    }
  } catch (err) {
    log.warn({ projectId, err }, 'failed to restore workspace from backup (non-fatal)')
  }

  log.info({ projectId }, 'workspace opened successfully')
  if (links?.agentUrl?.url) agentUrls.set(projectId, links.agentUrl.url)

  // Track which key opened this project (for continuation detection)
  const authNow = loadStoredAuth()
  if (authNow?.key) {
    db.prepare("UPDATE projects SET api_key_hash = ? WHERE id = ?").run(hashKey(authNow.key), projectId)
  }

  return c.json({ 
    ok: true, 
    sandbox: { host: creds.ipv4, port: creds.sshPort, user: creds.sshUsername },
    agentUrl: links?.agentUrl?.url,
    links
  })
})

// DELETE /projects/:id/workspace — disconnect
projectsRouter.delete('/:id/workspace', async (c) => {
  const projectId = c.req.param('id')
  await sshManager.disconnect(projectId).catch(() => {})
  return c.json({ ok: true })
})
