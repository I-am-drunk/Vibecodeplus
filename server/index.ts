import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import path from 'path'
import { initDB, getDB } from './state/db.ts'
import { loadConfig, getConfig } from './state/config.ts'
import { loadStoredAuth } from './state/auth.ts'
import { cli } from './cli/wrapper.ts'
import { wsHub as hub } from './ws/hub.ts'
import { sshManager } from './ssh/manager.ts'
import { fileWatcher } from './ssh/watcher.ts'
import { authRouter } from './routes/auth.ts'
import { projectsRouter } from './routes/projects.ts'
import { chatRouter } from './routes/chat.ts'
import { filesRouter } from './routes/files.ts'
import { backupsRouter } from './routes/backups.ts'
import { previewRouter } from './routes/preview.ts'
import { terminalRouter } from './routes/terminal.ts'
import { settingsRouter } from './routes/settings.ts'
import { continuationRouter } from './routes/continuation.ts'
import { streamRegistry } from './state/streams.ts'
import { addBrowserLogClient, removeBrowserLogClient } from './lib/logger.ts'

initDB()
loadConfig()
const storedAuth = loadStoredAuth()
if (storedAuth?.key) cli.setApiKey(storedAuth.key)
await cli.resolveBinary()

{
  const deleted = getDB().prepare(`
    DELETE FROM sessions WHERE id NOT IN (SELECT DISTINCT session_id FROM messages)
  `).run()

  if (deleted.changes > 0) {
    console.log(`[server] cleaned up ${deleted.changes} orphaned empty sessions`)
  }
}

{
  const auth = loadStoredAuth()
  if (auth?.key) {
    const result = await cli.listProjects()
    if (result.ok) {
      const remoteIds = new Set(result.data.map((project) => project.id))
      const local = getDB().prepare('SELECT id FROM projects').all() as { id: string }[]
      const missing = local.filter(({ id }) => !remoteIds.has(id)).length
      if (missing > 0) {
        console.log(`[server] retained ${missing} local projects that are missing remotely (preservation mode)`)
      }
    }
  }
}

const config = getConfig()
const PORT = config.port ?? 3847

const app = new Hono()
const isDev = process.env.NODE_ENV === 'development'

app.use('*', cors({ origin: isDev ? 'http://localhost:5173' : '*', credentials: true }))
if (isDev) app.use('*', logger())

app.route('/api/auth', authRouter)
app.route('/api/projects', projectsRouter)
app.route('/api/chat', chatRouter)
app.route('/api/files', filesRouter)
app.route('/api/backups', backupsRouter)
app.route('/api/preview', previewRouter)
app.route('/api/terminal', terminalRouter)
app.route('/api/settings', settingsRouter)
app.route('/api/continuation', continuationRouter)

app.get('/api/health', (c) => c.json({ ok: true, version: '0.1.0' }))

if (!isDev) {
  const distPath = path.resolve(process.cwd(), 'dist', 'client')

  app.get('/assets/*', async (c) => {
    const filePath = path.join(distPath, c.req.path)
    const file = Bun.file(filePath)

    if (!(await file.exists())) return c.notFound()

    const ext = filePath.split('.').pop()
    const mimeTypes: Record<string, string> = {
      js: 'application/javascript',
      css: 'text/css',
      json: 'application/json',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      svg: 'image/svg+xml',
      woff: 'font/woff',
      woff2: 'font/woff2',
    }

    const contentType = mimeTypes[ext || ''] || 'application/octet-stream'
    return new Response(file, { headers: { 'Content-Type': contentType } })
  })

  app.get('/favicon.svg', async () => {
    const file = Bun.file(path.join(distPath, 'favicon.svg'))
    return new Response(file, { headers: { 'Content-Type': 'image/svg+xml' } })
  })

  app.get('*', async (c) => {
    const html = await Bun.file(path.join(distPath, 'index.html')).text()
    return c.html(html)
  })
}

Bun.serve({
  port: PORT,
  fetch(req, server) {
    const url = new URL(req.url)

    if (url.pathname === '/ws/logs') {
      const upgraded = server.upgrade(req, { data: { type: 'logs' } })
      if (upgraded) return undefined
      return new Response('WebSocket upgrade failed', { status: 400 })
    }

    if (url.pathname.startsWith('/ws/project/')) {
      const projectId = url.pathname.split('/ws/project/')[1]
      const upgraded = server.upgrade(req, { data: { type: 'hub', projectId } })
      if (upgraded) return undefined
      return new Response('WebSocket upgrade failed', { status: 400 })
    }

    if (url.pathname.startsWith('/ws/terminal/')) {
      const projectId = url.pathname.split('/')[3]
      const upgraded = server.upgrade(req, { data: { type: 'terminal', projectId } })
      if (upgraded) return undefined
      return new Response('WebSocket upgrade failed', { status: 400 })
    }

    return app.fetch(req)
  },

  websocket: {
    open(ws) {
      const { type, projectId } = ws.data as { type: string; projectId?: string }

      if (type === 'logs') {
        addBrowserLogClient(ws)
        return
      }

      if (type === 'hub') {
        if (!projectId) return

        hub.subscribe(ws as any, [`project:${projectId}`])
        hub.broadcast(`project:${projectId}`, { type: 'ws:connected' })

        const exists = getDB().prepare('SELECT id FROM projects WHERE id = ?').get(projectId)
        if (exists) fileWatcher.start(projectId)
        return
      }

      if (type === 'terminal') {
        if (!projectId) return

        sshManager.getConnection(projectId)
          .then((conn) => {
            conn.shell({ term: 'xterm-256color', cols: 80, rows: 24 }, (err, stream) => {
              if (err) {
                ws.send(JSON.stringify({ type: 'terminal:error', message: err.message }))
                ws.close()
                return
              }

              ;(ws as any).__termStream = stream

              stream.on('data', (chunk: Buffer) => ws.send(chunk))
              stream.stderr.on('data', (chunk: Buffer) => ws.send(chunk))
              stream.on('close', () => ws.close())
            })
          })
          .catch((err) => {
            ws.send(JSON.stringify({ type: 'terminal:error', message: err.message }))
            ws.close()
          })
      }
    },

    message(ws, data) {
      const { type } = ws.data as { type: string }

      if (type === 'hub' && typeof data === 'string') {
        hub.handleMessage(ws as any, data)
      }

      if (type === 'terminal') {
        const stream = (ws as any).__termStream
        if (!stream) return

        if (typeof data === 'string') {
          try {
            const message = JSON.parse(data)
            if (message.type === 'terminal:resize') {
              stream.setWindow(message.rows, message.cols, 0, 0)
            } else if (message.type === 'terminal:input') {
              stream.write(message.data)
            }
          } catch {
            stream.write(data)
          }
        } else {
          stream.write(Buffer.from(data as ArrayBuffer))
        }
      }
    },

    close(ws) {
      const { type, projectId } = ws.data as { type: string; projectId?: string }

      if (type === 'logs') {
        removeBrowserLogClient(ws)
      } else if (type === 'hub' && projectId) {
        hub.unsubscribe(ws as any, [`project:${projectId}`])
      } else if (type === 'terminal') {
        const stream = (ws as any).__termStream
        if (stream) stream.end()
      }

      hub.removeClient(ws as any)
    },
  },
})

console.log(`\n  Vibecode Studio`)
console.log(`  Running at http://localhost:${PORT}\n`)

fileWatcher.onChange((projectId, changes) => {
  hub.broadcast(`project:${projectId}`, { type: 'file:changed', changes })
})

function shutdown(signal: string) {
  console.log(`[server] ${signal} received — stopping ${streamRegistry.getActive().length} active streams`)
  streamRegistry.abortAll(`server ${signal}`)
  process.exit(0)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
