import { Hono } from 'hono'
import { sshFiles } from '../ssh/files.ts'
import { createLogger } from '../lib/logger.ts'
import { AppError, badRequest, jsonError, success } from '../lib/errors.ts'
import {
  parseFilesPathRequest,
  parseFilesRenameRequest,
  parseFilesWriteRequest,
  readBody,
} from '../contracts/routes.ts'
import { validatePath } from '../lib/validation.ts'

const log = createLogger('files')

export const filesRouter = new Hono()

filesRouter.get('/', async (c) => {
  try {
    const projectId = c.req.query('projectId')?.trim()
    const path = validatePath(c.req.query('path') ?? '/', 'path')

    if (!projectId) throw badRequest('projectId required')

    const entries = await sshFiles.listDir(projectId, path)
    return c.json(success({ entries }))
  } catch (error) {
    log.error({ error: String(error) }, 'failed to list directory')
    return jsonError(c, error)
  }
})

filesRouter.get('/content', async (c) => {
  try {
    const projectId = c.req.query('projectId')?.trim()
    const path = c.req.query('path')

    if (!projectId || !path) throw badRequest('projectId and path required')
    const safePath = validatePath(path, 'path')

    const content = await sshFiles.readFile(projectId, safePath)
    return c.text(content, 200, { 'Content-Type': 'text/plain; charset=utf-8' })
  } catch (error) {
    log.error({ error: String(error) }, 'failed to read file')
    return jsonError(c, error)
  }
})

filesRouter.put('/content', async (c) => {
  try {
    const body = await parseFilesWriteRequest(await readBody(c))
    await sshFiles.writeFile(body.projectId, body.path, body.content)
    return c.json(success({ ok: true }))
  } catch (error) {
    log.error({ error: String(error) }, 'failed to write file')
    return jsonError(c, error)
  }
})

filesRouter.post('/mkdir', async (c) => {
  try {
    const body = await parseFilesPathRequest(await readBody(c))
    await sshFiles.mkdir(body.projectId, body.path)
    return c.json(success({ ok: true }))
  } catch (error) {
    log.error({ error: String(error) }, 'failed to create directory')
    return jsonError(c, error)
  }
})

filesRouter.delete('/', async (c) => {
  try {
    const body = await parseFilesPathRequest(await readBody(c))
    await sshFiles.remove(body.projectId, body.path)
    return c.json(success({ ok: true }))
  } catch (error) {
    log.error({ error: String(error) }, 'failed to delete file')
    return jsonError(c, error)
  }
})

filesRouter.post('/rename', async (c) => {
  try {
    const body = await parseFilesRenameRequest(await readBody(c))
    await sshFiles.rename(body.projectId, body.from, body.to)
    return c.json(success({ ok: true }))
  } catch (error) {
    log.error({ error: String(error) }, 'failed to rename file')
    return jsonError(c, error)
  }
})

filesRouter.get('/download', async (c) => {
  try {
    const projectId = c.req.query('projectId')?.trim()
    const path = c.req.query('path')

    if (!projectId || !path) throw badRequest('projectId and path required')
    const safePath = validatePath(path, 'path')

    const content = await sshFiles.readFile(projectId, safePath)
    const filename = safePath.split('/').pop() ?? 'file'

    return c.text(content, 200, {
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Type': 'application/octet-stream',
    })
  } catch (error) {
    if (error instanceof AppError) {
      return jsonError(c, error)
    }

    log.error({ error: String(error) }, 'failed to download file')
    return jsonError(c, error)
  }
})
