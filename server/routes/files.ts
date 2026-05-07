import { Hono } from 'hono'
import { sshFiles } from '../ssh/files.ts'
import { createLogger } from '../lib/logger.ts'

const log = createLogger('files')

export const filesRouter = new Hono()

filesRouter.get('/', async (c) => {
  const projectId = c.req.query('projectId')
  const path = c.req.query('path') ?? '/'
  if (!projectId) return c.json({ error: 'projectId required' }, 400)
  log.debug({ projectId, path }, 'listing directory')
  try {
    const entries = await sshFiles.listDir(projectId, path)
    log.debug({ projectId, path, count: entries.length }, 'directory listed')
    return c.json({ entries })
  } catch (err) {
    log.error({ projectId, path, err }, 'failed to list directory')
    return c.json({ error: String(err) }, 500)
  }
})

filesRouter.get('/content', async (c) => {
  const projectId = c.req.query('projectId')
  const path = c.req.query('path')
  if (!projectId || !path) return c.json({ error: 'projectId and path required' }, 400)
  log.debug({ projectId, path }, 'reading file')
  try {
    const content = await sshFiles.readFile(projectId, path)
    log.debug({ projectId, path, size: content.length }, 'file read')
    return c.text(content, 200, { 'Content-Type': 'text/plain; charset=utf-8' })
  } catch (err) {
    log.error({ projectId, path, err }, 'failed to read file')
    return c.json({ error: String(err) }, 500)
  }
})

filesRouter.put('/content', async (c) => {
  const { projectId, path, content } = await c.req.json<{ projectId: string; path: string; content: string }>()
  if (!projectId || !path) return c.json({ error: 'projectId and path required' }, 400)
  log.info({ projectId, path, size: content?.length }, 'writing file')
  try {
    await sshFiles.writeFile(projectId, path, content)
    log.info({ projectId, path }, 'file written')
    return c.json({ ok: true })
  } catch (err) {
    log.error({ projectId, path, err }, 'failed to write file')
    return c.json({ error: String(err) }, 500)
  }
})

filesRouter.post('/mkdir', async (c) => {
  const { projectId, path } = await c.req.json<{ projectId: string; path: string }>()
  if (!projectId || !path) return c.json({ error: 'projectId and path required' }, 400)
  log.info({ projectId, path }, 'creating directory')
  try {
    await sshFiles.mkdir(projectId, path)
    log.info({ projectId, path }, 'directory created')
    return c.json({ ok: true })
  } catch (err) {
    log.error({ projectId, path, err }, 'failed to create directory')
    return c.json({ error: String(err) }, 500)
  }
})

filesRouter.delete('/', async (c) => {
  const { projectId, path } = await c.req.json<{ projectId: string; path: string }>()
  if (!projectId || !path) return c.json({ error: 'projectId and path required' }, 400)
  log.info({ projectId, path }, 'deleting file/directory')
  try {
    await sshFiles.remove(projectId, path)
    log.info({ projectId, path }, 'file/directory deleted')
    return c.json({ ok: true })
  } catch (err) {
    log.error({ projectId, path, err }, 'failed to delete')
    return c.json({ error: String(err) }, 500)
  }
})

filesRouter.post('/rename', async (c) => {
  const { projectId, from, to } = await c.req.json<{ projectId: string; from: string; to: string }>()
  if (!projectId || !from || !to) return c.json({ error: 'projectId, from, and to required' }, 400)
  log.info({ projectId, from, to }, 'renaming file/directory')
  try {
    await sshFiles.rename(projectId, from, to)
    log.info({ projectId, from, to }, 'file/directory renamed')
    return c.json({ ok: true })
  } catch (err) {
    log.error({ projectId, from, to, err }, 'failed to rename')
    return c.json({ error: String(err) }, 500)
  }
})

filesRouter.get('/download', async (c) => {
  const projectId = c.req.query('projectId')
  const path = c.req.query('path')
  if (!projectId || !path) return c.json({ error: 'projectId and path required' }, 400)
  log.info({ projectId, path }, 'downloading file')
  try {
    const content = await sshFiles.readFile(projectId, path)
    const filename = path.split('/').pop() ?? 'file'
    log.info({ projectId, path, size: content.length }, 'file downloaded')
    return c.text(content, 200, {
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Type': 'application/octet-stream',
    })
  } catch (err) {
    log.error({ projectId, path, err }, 'failed to download file')
    return c.json({ error: String(err) }, 500)
  }
})
