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

type ChatRequest = {
  projectId?: string
  model?: string
  prompt?: string
  sessionId?: string
  agentUrl?: string
}

function extractTextChunk(event: any): string {
  if (typeof event?.text === 'string') return event.text
  if (typeof event?.delta === 'string') return event.delta
  if (typeof event?.content === 'string' && event.type === 'text') return event.content
  if (typeof event?.text?.delta === 'string') return event.text.delta
  return ''
}

function normalizeToolUse(event: any) {
  if (event?.type !== 'tool_use') return null
  const payload = event.tool_use ?? event
  if (!payload?.id || !payload?.name) return null
  return {
    id: String(payload.id),
    name: String(payload.name),
    input: payload.input ?? {},
  }
}

function normalizeToolResult(event: any) {
  if (event?.type !== 'tool_result') return null
  const payload = event.tool_result ?? event
  if (!payload?.tool_use_id) return null

  return {
    tool_use_id: String(payload.tool_use_id),
    content:
      typeof payload.content === 'string'
        ? payload.content
        : JSON.stringify(payload.content ?? ''),
    is_error: !!payload.is_error,
  }
}

function ensureSession(projectId: string, model: string, prompt: string, requestedSessionId?: string) {
  const db = getDB()

  if (!requestedSessionId) {
    const sessionId = crypto.randomUUID()
    const title = prompt.slice(0, 80)

    db.prepare(`
      INSERT INTO sessions (id, project_id, model, title, message_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, 0, datetime('now'), datetime('now'))
    `).run(sessionId, projectId, model, title)

    return sessionId
  }

  const sessionRow = db.prepare('SELECT id, project_id FROM sessions WHERE id = ?').get(requestedSessionId) as
    | { id: string; project_id: string }
    | undefined

  if (!sessionRow) {
    throw new Error('Session not found')
  }

  if (sessionRow.project_id !== projectId) {
    throw new Error('Session does not belong to this project')
  }

  db.prepare(`UPDATE sessions SET updated_at = datetime('now') WHERE id = ?`).run(requestedSessionId)
  return requestedSessionId
}

function saveUserMessage(sessionId: string, prompt: string) {
  const db = getDB()
  db.prepare(`
    INSERT INTO messages (id, session_id, role, content, status, created_at)
    VALUES (?, ?, 'user', ?, 'complete', datetime('now'))
  `).run(crypto.randomUUID(), sessionId, prompt)

  db.prepare(`
    UPDATE sessions
    SET message_count = message_count + 1, updated_at = datetime('now')
    WHERE id = ?
  `).run(sessionId)
}

function saveAssistantMessage(
  sessionId: string,
  content: string,
  opts: { status: 'complete' | 'cut_off' | 'error' | 'empty'; inputTokens: number; outputTokens: number; toolCalls?: any[] },
) {
  const db = getDB()

  db.prepare(`
    INSERT INTO messages (id, session_id, role, content, input_tokens, output_tokens, tool_calls, status, created_at)
    VALUES (?, ?, 'assistant', ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    crypto.randomUUID(),
    sessionId,
    content,
    opts.inputTokens,
    opts.outputTokens,
    opts.toolCalls?.length ? JSON.stringify(opts.toolCalls) : null,
    opts.status,
  )

  db.prepare(`
    UPDATE sessions
    SET
      message_count = message_count + 1,
      total_input_tokens = total_input_tokens + ?,
      total_output_tokens = total_output_tokens + ?,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(opts.inputTokens, opts.outputTokens, sessionId)
}

chatRouter.post('/', async (c) => {
  const body = await c.req.json<ChatRequest>()

  const projectId = body.projectId?.trim()
  const prompt = body.prompt?.trim()
  const model = body.model?.trim() || 'claude-sonnet-4-6'

  if (!projectId || !prompt) {
    return c.json({ error: 'projectId and prompt are required' }, 400)
  }

  const resolvedAgentUrl = agentUrls.get(projectId) ?? body.agentUrl
  if (!resolvedAgentUrl) {
    return c.json({ error: 'agentUrl not available — open workspace first' }, 400)
  }

  let sessionId: string
  try {
    sessionId = ensureSession(projectId, model, prompt, body.sessionId)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ error: message }, 400)
  }

  saveUserMessage(sessionId, prompt)

  hub.broadcast(`project:${projectId}`, {
    type: 'chat:stream:start',
    sessionId,
  })

  ;(async () => {
    const abortController = new AbortController()
    streamRegistry.register(sessionId, projectId, abortController)

    let assistantText = ''
    let inputTokens = 0
    let outputTokens = 0
    let sawDone = false
    let sawError = false
    let creditsExhausted = false
    let stoppedEarly = false

    const toolCalls: Array<any> = []

    try {
      for await (const event of cli.agentSend(resolvedAgentUrl, model, prompt, {
        signal: abortController.signal,
      })) {
        hub.broadcast(`project:${projectId}`, { type: 'chat:event', sessionId, event })

        const textChunk = extractTextChunk(event)
        if (textChunk) {
          assistantText += textChunk
        }

        const toolUse = normalizeToolUse(event)
        if (toolUse) {
          toolCalls.push({ ...toolUse, status: 'running' })
        }

        const toolResult = normalizeToolResult(event)
        if (toolResult) {
          const target = toolCalls.find((call) => call.id === toolResult.tool_use_id)
          if (target) {
            target.result = toolResult.content
            target.status = toolResult.is_error ? 'error' : 'success'
          }
        }

        if (event.type === 'done') {
          inputTokens = Number(event.input_tokens || 0)
          outputTokens = Number(event.output_tokens || 0)
          sawDone = true
        }

        if (event.type === 'credits_low') {
          hub.broadcast(`project:${projectId}`, {
            type: 'credits:low',
            balance: event.balance,
          })
        }

        if (event.type === 'credits_exhausted') {
          creditsExhausted = true
          stoppedEarly = true

          await backupCoordinator.backupNow(projectId, { trigger: 'credits_exhausted', sessionId }).catch(() => {})

          hub.broadcast(`project:${projectId}`, {
            type: 'credits:exhausted',
            sessionId,
          })
          break
        }

        if (event.type === 'error') {
          sawError = true
          stoppedEarly = true
          break
        }
      }
    } catch (err) {
      sawError = true
      stoppedEarly = true

      const message = err instanceof Error ? err.message : String(err)
      log.error({ sessionId, projectId, message }, 'stream failed')

      hub.broadcast(`project:${projectId}`, {
        type: 'chat:stream:error',
        sessionId,
        message,
      })
    } finally {
      streamRegistry.unregister(sessionId)
    }

    const status: 'complete' | 'cut_off' | 'error' | 'empty' = sawDone
      ? 'complete'
      : sawError
        ? 'error'
        : stoppedEarly
          ? 'cut_off'
          : assistantText
            ? 'cut_off'
            : 'empty'

    if (assistantText || toolCalls.length > 0 || status !== 'empty') {
      saveAssistantMessage(sessionId, assistantText, {
        status,
        inputTokens,
        outputTokens,
        toolCalls,
      })
    }

    hub.broadcast(`project:${projectId}`, {
      type: 'chat:stream:end',
      sessionId,
      cutOff: status === 'cut_off' || status === 'error' || status === 'empty',
      empty: !assistantText,
      creditsExhausted,
    })
  })()

  return c.json({ sessionId })
})

chatRouter.get('/sessions', async (c) => {
  const projectId = c.req.query('projectId')
  if (!projectId) return c.json({ error: 'projectId required' }, 400)

  const db = getDB()
  const rows = db.prepare(`
    SELECT s.*, COUNT(m.id) as message_count
    FROM sessions s
    LEFT JOIN messages m ON m.session_id = s.id
    WHERE s.project_id = ?
    GROUP BY s.id
    ORDER BY s.updated_at DESC
  `).all(projectId) as any[]

  return c.json({
    sessions: rows.map((row) => ({
      id: row.id,
      projectId: row.project_id,
      model: row.model,
      title: row.title,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      messageCount: row.message_count,
    })),
  })
})

chatRouter.get('/sessions/:id', async (c) => {
  const sessionId = c.req.param('id')
  const db = getDB()

  const sessionRow = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as any
  if (!sessionRow) return c.json({ error: 'session not found' }, 404)

  const messageRows = db.prepare(`
    SELECT *
    FROM messages
    WHERE session_id = ?
    ORDER BY created_at ASC
  `).all(sessionId) as any[]

  return c.json({
    session: {
      id: sessionRow.id,
      projectId: sessionRow.project_id,
      model: sessionRow.model,
      title: sessionRow.title,
      createdAt: sessionRow.created_at,
      updatedAt: sessionRow.updated_at,
    },
    messages: messageRows.map((row) => ({
      id: row.id,
      role: row.role,
      content: row.content,
      createdAt: row.created_at,
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      status: row.status,
    })),
  })
})

chatRouter.delete('/sessions/:id', async (c) => {
  const sessionId = c.req.param('id')
  const db = getDB()

  db.prepare('DELETE FROM messages WHERE session_id = ?').run(sessionId)
  db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId)

  return c.json({ ok: true })
})

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
    '',
    `**Project:** ${session.project_id}  `,
    `**Model:** ${session.model}  `,
    `**Created:** ${session.created_at}  `,
    '',
    '---',
    '',
  ]

  for (const message of messages) {
    lines.push(`**${message.role === 'user' ? 'You' : 'Assistant'}** · ${message.created_at}`)
    lines.push('')
    lines.push(message.content)
    lines.push('')
    lines.push('---')
    lines.push('')
  }

  return c.text(lines.join('\n'), 200, {
    'Content-Type': 'text/markdown',
    'Content-Disposition': `attachment; filename="session-${sessionId}.md"`,
  })
})

chatRouter.post('/abort', async (c) => {
  const { projectId, sessionId } = await c.req.json<{ projectId?: string; sessionId?: string }>()
  if (!projectId || !sessionId) return c.json({ error: 'projectId and sessionId required' }, 400)

  const aborted = streamRegistry.abort(sessionId, 'user aborted')
  hub.broadcast(`project:${projectId}`, { type: 'chat:aborted', sessionId })

  return c.json({ ok: true, aborted })
})

chatRouter.post('/stop', async (c) => {
  const { projectId, sessionId } = await c.req.json<{ projectId?: string; sessionId?: string }>()
  if (!projectId || !sessionId) return c.json({ error: 'projectId and sessionId required' }, 400)

  streamRegistry.abort(sessionId, 'user stopped')

  const agentUrl = agentUrls.get(projectId)
  if (!agentUrl) {
    hub.broadcast(`project:${projectId}`, { type: 'chat:stream:end', sessionId, cutOff: true, empty: true })
    return c.json({ ok: true, stopped: false, reason: 'no agentUrl' })
  }

  const result = await cli.agentStop(agentUrl)
  hub.broadcast(`project:${projectId}`, { type: 'chat:stream:end', sessionId, cutOff: true, empty: true })

  return c.json({ ok: true, stopped: result.ok })
})
