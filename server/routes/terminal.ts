import { Hono } from 'hono'
import { sshManager } from '../ssh/manager.ts'
import { createLogger } from '../lib/logger.ts'
import type { ServerWebSocket } from 'bun'

const log = createLogger('terminal')

export const terminalRouter = new Hono()

// Terminal sessions are handled at the WebSocket layer in index.ts.
// This REST endpoint handles session metadata.
const activeSessions = new Map<string, { projectId: string; createdAt: Date }>()

terminalRouter.post('/sessions', (c) => {
  const sessionId = crypto.randomUUID()
  log.info({ sessionId }, 'terminal session created')
  // Body will carry projectId when WS connects
  return c.json({ sessionId })
})

terminalRouter.get('/sessions', (c) => {
  const list = [...activeSessions.entries()].map(([id, s]) => ({ id, ...s }))
  log.debug({ count: list.length }, 'listing terminal sessions')
  return c.json({ sessions: list })
})

terminalRouter.delete('/sessions/:id', (c) => {
  const id = c.req.param('id')
  log.info({ sessionId: id }, 'deleting terminal session')
  activeSessions.delete(id)
  return c.json({ ok: true })
})

export function handleTerminalWebSocket(
  ws: ServerWebSocket<{ projectId: string; sessionId: string }>,
  isOpen: boolean
) {
  // Handled inline in index.ts websocket handler
}
