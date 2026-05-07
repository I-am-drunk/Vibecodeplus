import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { serveStatic } from 'hono/bun'
import path from 'path'
import { initDB } from './state/db.ts'
import { loadConfig, getConfig } from './state/config.ts'
import { loadStoredAuth } from './state/auth.ts'
import { cli } from './cli/wrapper.ts'
import { wsHub as hub } from './ws/hub.ts'
import { sshManager } from './ssh/manager.ts'
import { fileWatcher } from './ssh/watcher.ts'
import { backupCoordinator } from './backup/coordinator.ts'
import { authRouter } from './routes/auth.ts'
import { projectsRouter } from './routes/projects.ts'
import { chatRouter } from './routes/chat.ts'
import { filesRouter } from './routes/files.ts'
import { backupsRouter } from './routes/backups.ts'
import { previewRouter } from './routes/preview.ts'
import { terminalRouter } from './routes/terminal.ts'
import { settingsRouter } from './routes/settings.ts'
import { continuationRouter } from './routes/continuation.ts'

// Bootstrap singletons
initDB()
loadConfig()
loadStoredAuth()
await cli.resolveBinary()

const config = getConfig()
const PORT = config.port ?? 3847

console.log('[server] NODE_ENV:', process.env.NODE_ENV)

const app = new Hono()

const isDev = process.env.NODE_ENV === 'development'
app.use('*', cors({ origin: isDev ? 'http://localhost:5173' : '*', credentials: true }))
if (process.env.NODE_ENV === 'development') app.use('*', logger())

// API routes
app.route('/api/auth', authRouter)
app.route('/api/projects', projectsRouter)
app.route('/api/chat', chatRouter)
app.route('/api/files', filesRouter)
app.route('/api/backups', backupsRouter)
app.route('/api/preview', previewRouter)
app.route('/api/terminal', terminalRouter)
app.route('/api/settings', settingsRouter)
  app.route('/api/continuation', continuationRouter)

// Health check
app.get('/api/health', (c) => c.json({ ok: true, version: '1.0.0' }))

// In production, serve the built frontend
if (process.env.NODE_ENV !== 'development') {
  const distPath = path.resolve(process.cwd(), 'dist', 'client')
  console.log('[server] Static files path:', distPath)
  
  // Serve static assets
  app.get('/assets/*', async (c) => {
    const filePath = path.join(distPath, c.req.path)
    const file = Bun.file(filePath)
    if (await file.exists()) {
      const ext = filePath.split('.').pop()
      const mimeTypes: Record<string, string> = {
        'js': 'application/javascript',
        'css': 'text/css',
        'json': 'application/json',
        'png': 'image/png',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'svg': 'image/svg+xml',
        'woff': 'font/woff',
        'woff2': 'font/woff2',
      }
      const contentType = mimeTypes[ext || ''] || 'application/octet-stream'
      return new Response(file, { headers: { 'Content-Type': contentType } })
    }
    return c.notFound()
  })
  
  app.get('/favicon.svg', async (c) => {
    const file = Bun.file(path.join(distPath, 'favicon.svg'))
    return new Response(file, { headers: { 'Content-Type': 'image/svg+xml' } })
  })
  
  // SPA fallback - serve index.html for all other routes
  app.get('*', async (c) => {
    const html = await Bun.file(path.join(distPath, 'index.html')).text()
    return c.html(html)
  })
}

// WebSocket server for real-time events + terminal
const server = Bun.serve({
  port: PORT,
  fetch(req, server) {
    const url = new URL(req.url)

    // WebSocket upgrade for logs
    if (url.pathname === '/ws/logs') {
      const upgraded = server.upgrade(req, { data: { type: 'logs' } })
      if (upgraded) return undefined
      return new Response('WebSocket upgrade failed', { status: 400 })
    }

    // WebSocket upgrade for hub (project events)
    if (url.pathname.startsWith('/ws/project/')) {
      const projectId = url.pathname.split('/ws/project/')[1]
      const upgraded = server.upgrade(req, { data: { type: 'hub', projectId } })
      if (upgraded) return undefined
      return new Response('WebSocket upgrade failed', { status: 400 })
    }

    // WebSocket upgrade for terminal
    if (url.pathname.startsWith('/ws/terminal/')) {
      const parts = url.pathname.split('/')
      const projectId = parts[3]
      const upgraded = server.upgrade(req, { data: { type: 'terminal', projectId } })
      if (upgraded) return undefined
      return new Response('WebSocket upgrade failed', { status: 400 })
    }

    return app.fetch(req)
  },

  websocket: {
    open(ws) {
      const { type, projectId } = ws.data as any

      if (type === 'logs') {
        const { addBrowserLogClient } = require('./lib/logger.ts')
        addBrowserLogClient(ws)
        return
      }

      if (type === 'hub') {
        hub.subscribe(ws as any, [`project:${projectId}`])
        hub.broadcast(`project:${projectId}`, { type: 'ws:connected' })
        // Start file watcher for this project (only if projectId is valid)
        if (projectId && projectId !== 'null' && projectId !== 'undefined') {
          fileWatcher.start(projectId)
        }
      } else if (type === 'terminal') {
        // SSH terminal — connect a shell channel
        sshManager.getConnection(projectId).then(conn => {
          conn.shell({ term: 'xterm-256color', cols: 80, rows: 24 }, (err, stream) => {
            if (err) {
              ws.send(JSON.stringify({ type: 'terminal:error', message: err.message }))
              ws.close()
              return
            }
            ;(ws as any).__termStream = stream

            stream.on('data', (chunk: Buffer) => {
              ws.send(chunk)
            })
            stream.stderr.on('data', (chunk: Buffer) => {
              ws.send(chunk)
            })
            stream.on('close', () => ws.close())
          })
        }).catch(err => {
          ws.send(JSON.stringify({ type: 'terminal:error', message: err.message }))
          ws.close()
        })
      }
    },

    message(ws, data) {
      const { type } = ws.data as any

      if (type === 'hub') {
        // Route to WebSocket hub for project events
        if (typeof data === 'string') {
          hub.handleMessage(ws as any, data)
        }
      }

      if (type === 'terminal') {
        const stream = (ws as any).__termStream
        if (!stream) return

        if (typeof data === 'string') {
          try {
            const msg = JSON.parse(data)
            if (msg.type === 'terminal:resize') {
              stream.setWindow(msg.rows, msg.cols, 0, 0)
            } else if (msg.type === 'terminal:input') {
              stream.write(msg.data)
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
      const { type, projectId } = ws.data as any
      if (type === 'logs') {
        const { removeBrowserLogClient } = require('./lib/logger.ts')
        removeBrowserLogClient(ws)
      } else if (type === 'hub') {
        hub.unsubscribe(ws as any, [`project:${projectId}`])
      } else if (type === 'terminal') {
        const stream = (ws as any).__termStream
        if (stream) stream.end()
      }
    },
  },
})

console.log(`\n  Vibecode Studio`)
console.log(`  Running at http://localhost:${PORT}\n`)

// Broadcast file changes to subscribed clients
fileWatcher.onChange((projectId, changes) => {
  hub.broadcast(`project:${projectId}`, { type: 'file:changed', changes })
})
