import { Hono } from 'hono'
import { sshFiles } from '../ssh/files.ts'
import { sshManager } from '../ssh/manager.ts'
import { createLogger } from '../lib/logger.ts'
import { AppError, badRequest, forbidden, jsonError, success } from '../lib/errors.ts'
import {
  parseFilesPathRequest,
  parseFilesRenameRequest,
  parseFilesWriteRequest,
  readBody,
} from '../contracts/routes.ts'
import { validatePath } from '../lib/validation.ts'

const log = createLogger('files')

export const filesRouter = new Hono()

function toSafeDownloadFilename(path: string): string {
  const base = path.split('/').pop() ?? 'file'
  const sanitized = base.replace(/[\r\n"\\]/g, '_').trim()
  return sanitized || 'file'
}

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

    // QA-161: Binary file read guard — reject known binary extensions
    const binaryExtensions = new Set([
      '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg', '.ico', '.tiff', '.tif',
      '.mp3', '.mp4', '.wav', '.avi', '.mov', '.mkv', '.flac', '.ogg', '.webm',
      '.zip', '.tar', '.gz', '.bz2', '.xz', '.7z', '.rar', '.tgz',
      '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
      '.exe', '.dll', '.so', '.dylib', '.bin', '.dat', '.db', '.sqlite',
      '.woff', '.woff2', '.ttf', '.eot', '.otf',
      '.pyc', '.class', '.o', '.obj',
    ])
    const ext = safePath.substring(safePath.lastIndexOf('.')).toLowerCase()
    if (binaryExtensions.has(ext)) {
      return c.json(success({ binary: true, path: safePath, message: 'Binary file — content not available as text' }))
    }

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
    // CP-35: No writes after workspace unmount
    if (!sshManager.isConnected(body.projectId)) {
      throw forbidden('Workspace is not connected. Please open the workspace before editing files.')
    }
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
    if (!sshManager.isConnected(body.projectId)) {
      throw forbidden('Workspace is not connected. Please open the workspace before creating directories.')
    }
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
    if (!sshManager.isConnected(body.projectId)) {
      throw forbidden('Workspace is not connected. Please open the workspace before deleting files.')
    }
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
    if (!sshManager.isConnected(body.projectId)) {
      throw forbidden('Workspace is not connected. Please open the workspace before renaming files.')
    }
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
    const filename = toSafeDownloadFilename(safePath)

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
