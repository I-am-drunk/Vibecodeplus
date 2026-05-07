import { Hono } from 'hono'
import { createHash } from 'crypto'
import { cli } from '../cli/wrapper.ts'
import { getDB } from '../state/db.ts'
import { loadStoredAuth, storeAuth } from '../state/auth.ts'
import { sshManager } from '../ssh/manager.ts'
import { captureNow, pushToProject } from '../continuation/capture.ts'
import { agentUrls } from './projects.ts'
import { createLogger } from '../lib/logger.ts'
import { fileWatcher } from '../ssh/watcher.ts'

const log = createLogger('continuation')

export const continuationRouter = new Hono()

function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex').slice(0, 16)
}

continuationRouter.get('/status/:projectId', (c) => {
  const { projectId } = c.req.param()
  const db = getDB()
  const row = db.prepare('SELECT api_key_hash, snapshot_dir, snapshot_at FROM projects WHERE id = ?').get(projectId) as any
  if (!row) return c.json({ error: 'not found' }, 404)
  const auth = loadStoredAuth()
  const currentHash = auth?.key ? hashKey(auth.key) : null
  const needsContinuation = !!(row.api_key_hash && currentHash && row.api_key_hash !== currentHash)
  return c.json({ snapshotDir: row.snapshot_dir, snapshotAt: row.snapshot_at, needsContinuation })
})

continuationRouter.post('/capture/:projectId', async (c) => {
  const { projectId } = c.req.param()
  try {
    const count = await captureNow(projectId)
    return c.json({ ok: true, fileCount: count })
  } catch (err) {
    return c.json({ error: String(err) }, 500)
  }
})

continuationRouter.post('/enact', async (c) => {
  const { sourceProjectId } = await c.req.json()
  if (!sourceProjectId) return c.json({ error: 'sourceProjectId required' }, 400)

  const db = getDB()
  const source = db.prepare('SELECT * FROM projects WHERE id = ?').get(sourceProjectId) as any
  if (!source) return c.json({ error: 'Source project not found' }, 404)

  const auth = loadStoredAuth()
  if (!auth?.key) return c.json({ error: 'No API key configured' }, 401)

  log.info({ sourceProjectId, name: source.name }, 'enacting continuation')

  try {
    // Create new project under current key
    const name = source.name || 'Continued Project'
    const result = await cli.createProject(name, { description: source.description || name })
    if (!result.ok) return c.json({ error: result.error.message }, 500)

    const newProjectId = result.data.id
    
    // Verify project was actually created
    await new Promise(r => setTimeout(r, 1000)) // Wait for eventual consistency
    const verify = await cli.listProjects()
    if (verify.ok) {
      const exists = verify.data.projects.some((p: any) => p.id === newProjectId)
      if (!exists) {
        log.error({ newProjectId }, 'project created but not in list - may have failed')
        return c.json({ error: 'Project creation failed - project not found after creation' }, 500)
      }
    }
    
    const newHash = hashKey(auth.key)

    // Register in DB
    db.prepare(`
      INSERT OR REPLACE INTO projects (id, name, description, default_model, api_key_hash)
      VALUES (?, ?, ?, ?, ?)
    `).run(newProjectId, name, source.description || '', source.default_model || 'claude-sonnet-4-6', newHash)

    // Acquire sandbox and push files in background
    const wsResult = await cli.acquireSandbox(newProjectId)
    if (wsResult.ok) {
      const { links } = wsResult.data
      if (links?.agentUrl?.url) agentUrls.set(newProjectId, links.agentUrl.url)
      
      // Push files in background if snapshot exists
      if (source.snapshot_dir) {
        sshManager.getConnection(newProjectId)
          .then(() => pushToProject(sourceProjectId, newProjectId))
          .then(() => log.info({ newProjectId }, 'files pushed successfully'))
          .catch((e) => log.warn({ newProjectId, err: String(e) }, 'file push failed'))
      }
    }

    log.info({ sourceProjectId, newProjectId }, 'continuation complete')
    
    // Delete the old orphaned project from local DB and stop all associated resources
    db.prepare('DELETE FROM projects WHERE id = ?').run(sourceProjectId)
    fileWatcher.stop(sourceProjectId)
    sshManager.closeConnection(sourceProjectId).catch(() => {})
    agentUrls.delete(sourceProjectId)
    log.info({ sourceProjectId }, 'deleted orphaned project from local DB')
    
    return c.json({ ok: true, newProjectId, name })
  } catch (err) {
    log.error({ err: String(err) }, 'continuation failed')
    return c.json({ error: String(err) }, 500)
  }
})
