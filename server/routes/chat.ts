import { Hono } from 'hono'
import { cli } from '../cli/wrapper.ts'
import { getDB } from '../state/db.ts'
import { wsHub as hub } from '../ws/hub.ts'
import { backupCoordinator } from '../backup/coordinator.ts'
import { createLogger } from '../lib/logger.ts'
import { agentUrls } from './projects.ts'
import { streamRegistry } from '../state/streams.ts'

const log = createLogger('chat')

export const chatRouter = new Hono()

// POST /chat — send a message, stream events via WebSocket
chatRouter.post('/', async (c) => {
  const { projectId, model, prompt, sessionId, agentUrl } = await c.req.json<{
    projectId: string
    model: string
    prompt: string
    sessionId?: string
    agentUrl?: string
  }>()

  log.info({ projectId, model, sessionId, promptLength: prompt?.length, agentUrl }, 'chat request received')

  if (!projectId || !prompt?.trim()) {
    log.warn({ projectId, hasPrompt: !!prompt }, 'validation failed - missing fields')
    return c.json({ error: 'projectId and prompt are required' }, 400)
  }

  // Always use server-side agentUrl (fresh from last openWorkspace), fall back to client-provided
  const serverAgentUrl = agentUrls.get(projectId)
  const resolvedAgentUrl = serverAgentUrl ?? agentUrl
  if (!resolvedAgentUrl) {
    log.warn({ projectId }, 'no agentUrl available')
    return c.json({ error: 'agentUrl not available — open workspace first' }, 400)
  }
  log.info({ projectId, serverAgentUrl, clientAgentUrl: agentUrl, resolved: resolvedAgentUrl, usingServer: !!serverAgentUrl }, 'resolved agentUrl')

  const db = getDB()
  log.debug({ projectId, sessionId }, 'processing chat request')

  // Resolve or create session
  let activeSessionId = sessionId
  if (!activeSessionId) {
    activeSessionId = crypto.randomUUID()
    log.info({ projectId, sessionId: activeSessionId, title: prompt.slice(0, 60) }, 'creating new session')
    try {
      db.prepare(`
        INSERT INTO sessions (id, project_id, model, title, created_at, updated_at)
        VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
      `).run(activeSessionId, projectId, model, prompt.slice(0, 60))
      log.debug({ sessionId: activeSessionId }, 'session created in DB')
    } catch (err) {
      log.error({ sessionId: activeSessionId, error: err }, 'failed to create session')
      throw err
    }
  } else {
    log.debug({ sessionId: activeSessionId }, 'using existing session')
    db.prepare('UPDATE sessions SET updated_at = datetime(\'now\') WHERE id = ?').run(activeSessionId)
  }

  // Store user message
  log.debug({ sessionId: activeSessionId, promptLength: prompt.length }, 'storing user message')
  try {
    db.prepare(`
      INSERT INTO messages (session_id, role, content, created_at)
      VALUES (?, 'user', ?, datetime('now'))
    `).run(activeSessionId, prompt)
    log.debug({ sessionId: activeSessionId }, 'user message stored')
  } catch (err) {
    log.error({ sessionId: activeSessionId, error: err }, 'failed to store user message')
    throw err
  }

  // Notify client that streaming started
  log.info({ projectId, sessionId: activeSessionId }, 'broadcasting stream start')
  hub.broadcast(`project:${projectId}`, {
    type: 'chat:stream:start',
    sessionId: activeSessionId,
  })

  // Stream in background — don't await, return session ID immediately
  log.info({ projectId, sessionId: activeSessionId, model }, 'starting background streaming')
  ;(async () => {
    log.debug({ sessionId: activeSessionId }, 'background stream started')
    log.debug({ sessionId: activeSessionId }, 'background stream started')
    const ac = new AbortController()
    streamRegistry.register(activeSessionId, projectId, ac)
    let fullText = ''
    let inputTokens = 0
    let outputTokens = 0
    let creditsExhausted = false

    try {
      log.info({ sessionId: activeSessionId, agentUrl: resolvedAgentUrl, model }, 'calling CLI agentSend')
      for await (const event of cli.agentSend(resolvedAgentUrl, model, prompt, {
        signal: ac.signal,
      })) {
        log.trace({ sessionId: activeSessionId, eventType: event.type }, 'received event from CLI')
        
        // Broadcast ALL events to client
        hub.broadcast(`project:${projectId}`, { type: 'chat:event', sessionId: activeSessionId, event })

        if (event.type === 'text' && event.text) {
          fullText += event.text
          log.debug({ sessionId: activeSessionId, len: event.text.length, subtype: (event as any).subtype }, 'text chunk')
        } else if (event.type === 'text') {
          log.debug({ sessionId: activeSessionId, subtype: (event as any).subtype, keys: Object.keys(event) }, 'text event no text field')
        } else if (event.type === 'thinking') {
          log.debug({ sessionId: activeSessionId }, 'received thinking event')
          hub.broadcast(`project:${projectId}`, { type: 'chat:reasoning', sessionId: activeSessionId, text: event.thinking?.summary || '' })
        } else if (event.type === 'done') {
          inputTokens = event.input_tokens
          outputTokens = event.output_tokens
          log.info({ sessionId: activeSessionId, inputTokens, outputTokens }, 'stream finished')
        } else if (event.type === 'credits_exhausted') {
          log.warn({ sessionId: activeSessionId, event }, 'CREDITS EXHAUSTED EVENT RECEIVED FROM AGENT')
          creditsExhausted = true
          // Trigger emergency backup
          await backupCoordinator.backupNow(projectId).catch(() => {})
          hub.broadcast(`project:${projectId}`, { type: 'credits:exhausted', sessionId: activeSessionId })
          break
        } else if (event.type === 'credits_low') {
          log.warn({ sessionId: activeSessionId, balance: event.balance }, 'credits low')
          hub.broadcast(`project:${projectId}`, { type: 'credits:low', balance: event.balance })
        }
      }
      log.info({ sessionId: activeSessionId, textLength: fullText.length }, 'CLI stream completed')
    } catch (err) {
      log.error({ sessionId: activeSessionId, error: err, errorMessage: err instanceof Error ? err.message : String(err), agentUrl: resolvedAgentUrl }, 'stream error')
      hub.broadcast(`project:${projectId}`, {
        type: 'chat:stream:error',
        sessionId: activeSessionId,
        message: err instanceof Error ? err.message : String(err),
      })
    } finally {
      streamRegistry.unregister(activeSessionId)
    }

    // Store assistant message (even partial on cutoff)
    if (fullText) {
      const isCutOff = inputTokens === 0 // no 'done' event means it was cut off
      log.debug({ sessionId: activeSessionId, textLength: fullText.length, isCutOff }, 'storing assistant message')
      db.prepare(`
        INSERT INTO messages (session_id, role, content, input_tokens, output_tokens, status, created_at)
        VALUES (?, 'assistant', ?, ?, ?, ?, datetime('now'))
      `).run(activeSessionId, fullText, inputTokens, outputTokens, isCutOff ? 'cut_off' : 'complete')
      log.debug({ sessionId: activeSessionId }, 'assistant message stored')
    }

    log.info({ sessionId: activeSessionId, creditsExhausted }, 'broadcasting stream end')
    hub.broadcast(`project:${projectId}`, {
      type: 'chat:stream:end',
      sessionId: activeSessionId,
      creditsExhausted,
      cutOff: fullText.length === 0 || (fullText.length > 0 && inputTokens === 0),
      empty: fullText.length === 0,
    })
  })()

  log.info({ sessionId: activeSessionId }, 'returning session ID to client')
  return c.json({ sessionId: activeSessionId })
})

// GET /chat/sessions?projectId=
chatRouter.get('/sessions', async (c) => {
  const projectId = c.req.query('projectId')
  log.info({ projectId }, 'listing sessions')
  
  if (!projectId) {
    log.warn('missing projectId in sessions list request')
    return c.json({ error: 'projectId required' }, 400)
  }

  const db = getDB()
  const rows = db.prepare(`
    SELECT s.*, COUNT(m.id) as message_count
    FROM sessions s
    LEFT JOIN messages m ON m.session_id = s.id
    WHERE s.project_id = ?
    GROUP BY s.id
    ORDER BY s.updated_at DESC
  `).all(projectId) as any[]

  const sessions = rows.map((s: any) => ({
    id: s.id,
    projectId: s.project_id,
    model: s.model,
    title: s.title,
    createdAt: s.created_at,
    updatedAt: s.updated_at,
    messageCount: s.message_count,
  }))

  log.info({ projectId, count: sessions.length }, 'sessions retrieved')

  return c.json({ sessions })
})

// GET /chat/sessions/:id
chatRouter.get('/sessions/:id', async (c) => {
  const sessionId = c.req.param('id')
  log.info({ sessionId }, 'getting session details')
  
  const db = getDB()

  const sessionRow = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as any
  if (!sessionRow) {
    log.warn({ sessionId }, 'session not found')
    return c.json({ error: 'session not found' }, 404)
  }

  const session = {
    id: sessionRow.id,
    projectId: sessionRow.project_id,
    model: sessionRow.model,
    title: sessionRow.title,
    createdAt: sessionRow.created_at,
    updatedAt: sessionRow.updated_at,
  }

  const messageRows = db.prepare(`
    SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC
  `).all(sessionId) as any[]

  const messages = messageRows.map((m: any) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    createdAt: m.created_at,
    inputTokens: m.input_tokens,
    outputTokens: m.output_tokens,
    status: m.status,
  }))

  log.info({ sessionId, messageCount: messages.length }, 'session retrieved')

  return c.json({ session, messages })
})

// DELETE /chat/sessions/:id
chatRouter.delete('/sessions/:id', async (c) => {
  const sessionId = c.req.param('id')
  const db = getDB()
  db.prepare('DELETE FROM messages WHERE session_id = ?').run(sessionId)
  db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId)
  return c.json({ ok: true })
})

// POST /chat/sessions/:id/export — export as markdown
chatRouter.post('/sessions/:id/export', async (c) => {
  const sessionId = c.req.param('id')
  const db = getDB()

  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as any
  if (!session) return c.json({ error: 'session not found' }, 404)

  const messages = db.prepare(`
    SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC
  `).all(sessionId) as any[]

  const lines: string[] = [
    `# ${session.title ?? 'Session'}`,
    ``,
    `**Project:** ${session.project_id}  `,
    `**Model:** ${session.model}  `,
    `**Created:** ${session.created_at}  `,
    ``,
    `---`,
    ``,
  ]

  for (const msg of messages) {
    lines.push(`**${msg.role === 'user' ? 'You' : 'Assistant'}** · ${msg.created_at}`)
    lines.push(``)
    lines.push(msg.content)
    lines.push(``)
    lines.push(`---`)
    lines.push(``)
  }

  return c.text(lines.join('\n'), 200, {
    'Content-Type': 'text/markdown',
    'Content-Disposition': `attachment; filename="session-${sessionId}.md"`,
  })
})

// POST /chat/abort — abort active stream
chatRouter.post('/abort', async (c) => {
  const { projectId, sessionId } = await c.req.json()
  const aborted = streamRegistry.abort(sessionId, 'user aborted')
  log.info({ projectId, sessionId, aborted }, 'abort requested')
  hub.broadcast(`project:${projectId}`, { type: 'chat:aborted', sessionId })
  return c.json({ ok: true, aborted })
})

// POST /chat/stop — stop the remote agent (kills credit-draining sessions)
chatRouter.post('/stop', async (c) => {
  const { projectId, sessionId } = await c.req.json()
  
  // Abort local stream if running
  streamRegistry.abort(sessionId, 'user stopped')
  
  // Stop remote agent
  const agentUrl = agentUrls.get(projectId)
  if (agentUrl) {
    const result = await cli.agentStop(agentUrl)
    log.info({ projectId, sessionId, agentUrl, result }, 'remote agent stop requested')
    hub.broadcast(`project:${projectId}`, { type: 'chat:stream:end', sessionId, cutOff: true })
    return c.json({ ok: true, stopped: result.ok })
  }
  
  hub.broadcast(`project:${projectId}`, { type: 'chat:stream:end', sessionId, cutOff: true })
  return c.json({ ok: true, stopped: false, reason: 'no agentUrl' })
})
