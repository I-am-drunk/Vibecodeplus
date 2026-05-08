import { Hono } from 'hono'
import { createHash } from 'crypto'
import { cli } from '../cli/wrapper.ts'
import { getDB } from '../state/db.ts'
import { loadStoredAuth } from '../state/auth.ts'
import { sshManager } from '../ssh/manager.ts'
import { captureNow, pushToProject } from '../continuation/capture.ts'
import { agentUrls } from './projects.ts'
import { createLogger } from '../lib/logger.ts'
import { fileWatcher } from '../ssh/watcher.ts'

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

continuationRouter.get('/status/:projectId', (c) => {
  const { projectId } = c.req.param()
  const db = getDB()
  const row = db
    .prepare('SELECT api_key_hash, snapshot_dir, snapshot_at FROM projects WHERE id = ?')
    .get(projectId) as { api_key_hash: string | null; snapshot_dir: string | null; snapshot_at: string | null } | undefined

  if (!row) return c.json({ error: 'not found' }, 404)

  const auth = loadStoredAuth()
  const currentHash = auth?.key ? hashKey(auth.key) : null
  const needsContinuation = !!(row.api_key_hash && currentHash && row.api_key_hash !== currentHash)

  return c.json({
    snapshotDir: row.snapshot_dir,
    snapshotAt: row.snapshot_at,
    needsContinuation,
  })
})

continuationRouter.post('/capture/:projectId', async (c) => {
  const { projectId } = c.req.param()

  try {
    const count = await captureNow(projectId)
    return c.json({ ok: true, fileCount: count })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})

continuationRouter.post('/enact', async (c) => {
  const { sourceProjectId } = await c.req.json<{ sourceProjectId?: string }>()
  if (!sourceProjectId) return c.json({ error: 'sourceProjectId required' }, 400)

  const db = getDB()
  const source = db.prepare('SELECT * FROM projects WHERE id = ?').get(sourceProjectId) as ProjectRow | undefined
  if (!source) return c.json({ error: 'Source project not found' }, 404)

  const auth = loadStoredAuth()
  if (!auth?.key) return c.json({ error: 'No API key configured' }, 401)

  const continuationName = source.name || 'Continued Project'
  const continuationDescription = source.description || continuationName

  log.info({ sourceProjectId, continuationName }, 'starting continuation migration')

  try {
    const createResult = await cli.createProject(continuationName, {
      description: continuationDescription,
    })

    if (!createResult.ok) {
      return c.json({ error: createResult.error.message || 'Failed to create continuation project' }, 500)
    }

    const newProjectId = createResult.data.id

    const verify = await cli.listProjects()
    if (verify.ok) {
      const exists = verify.data.some((project: any) => project.id === newProjectId)
      if (!exists) {
        return c.json({ error: 'Project creation could not be verified. Please try again.' }, 500)
      }
    }

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
      newProjectId,
      continuationName,
      continuationDescription,
      source.default_model || 'claude-sonnet-4-6',
      hashKey(auth.key),
    )

    let fileTransferWarning: string | null = null
    let preserveSourceProject = false

    const sandboxResult = await cli.acquireSandbox(newProjectId)
    if (sandboxResult.ok) {
      const sandbox = sandboxResult.data.sandbox
      const links = sandboxResult.data.links

      sshManager.primeCredentials(newProjectId, sandbox)
      await sshManager.getConnection(newProjectId)

      if (links?.agentUrl?.url) {
        agentUrls.set(newProjectId, links.agentUrl.url)
      }

      if (source.snapshot_dir) {
        try {
          await pushToProject(sourceProjectId, newProjectId)
        } catch (err) {
          fileTransferWarning = err instanceof Error ? err.message : String(err)
          preserveSourceProject = true
          log.warn({ sourceProjectId, newProjectId, warning: fileTransferWarning }, 'snapshot push failed')
        }
      }
    } else {
      fileTransferWarning = sandboxResult.error.message || 'Could not acquire sandbox for the new project'
      preserveSourceProject = !!source.snapshot_dir
    }

    if (!preserveSourceProject) {
      db.prepare('DELETE FROM projects WHERE id = ?').run(sourceProjectId)
      fileWatcher.stop(sourceProjectId)
      await sshManager.closeConnection(sourceProjectId).catch(() => {})
      agentUrls.delete(sourceProjectId)
    }

    return c.json({
      ok: true,
      newProjectId,
      name: continuationName,
      warning: fileTransferWarning,
      sourcePreserved: preserveSourceProject,
    })
  } catch (err) {
    log.error({ error: String(err), sourceProjectId }, 'continuation failed')
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})
