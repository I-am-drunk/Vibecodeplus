import { Hono } from 'hono'
import { backupCoordinator } from '../backup/coordinator.ts'
import { getDB } from '../state/db.ts'
import { createLogger } from '../lib/logger.ts'

const log = createLogger('backups')

export const backupsRouter = new Hono()

// GET /backups/:projectId
backupsRouter.get('/:projectId', (c) => {
  const projectId = c.req.param('projectId')
  log.debug({ projectId }, 'listing backups')
  const db = getDB()
  const backups = db.prepare(`
    SELECT * FROM backups WHERE project_id = ? ORDER BY created_at DESC
  `).all(projectId)
  log.info({ projectId, count: backups.length }, 'backups listed')
  return c.json({ backups })
})

// POST /backups/:projectId — trigger manual backup
backupsRouter.post('/:projectId', async (c) => {
  const projectId = c.req.param('projectId')
  log.info({ projectId }, 'manual backup triggered')
  try {
    const backup = await backupCoordinator.backupNow(projectId)
    log.info({ projectId, backupId: backup?.id }, 'backup completed')
    return c.json({ ok: true, backup })
  } catch (err) {
    log.error({ projectId, err }, 'backup failed')
    return c.json({ error: String(err) }, 500)
  }
})

// POST /backups/:projectId/restore/:backupId
backupsRouter.post('/:projectId/restore/:backupId', async (c) => {
  const projectId = c.req.param('projectId')
  const backupId = c.req.param('backupId')
  log.info({ projectId, backupId }, 'restore triggered')
  try {
    await backupCoordinator.restore(projectId, backupId)
    log.info({ projectId, backupId }, 'restore completed')
    return c.json({ ok: true })
  } catch (err) {
    log.error({ projectId, backupId, err }, 'restore failed')
    return c.json({ error: String(err) }, 500)
  }
})

// DELETE /backups/:projectId/:backupId
backupsRouter.delete('/:projectId/:backupId', (c) => {
  const backupId = c.req.param('backupId')
  const projectId = c.req.param('projectId')
  log.info({ projectId, backupId }, 'deleting backup')
  const db = getDB()
  db.prepare('DELETE FROM backups WHERE id = ?').run(backupId)
  log.info({ projectId, backupId }, 'backup deleted')
  return c.json({ ok: true })
})
