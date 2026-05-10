import { Hono } from 'hono'
import { cli } from '../cli/wrapper.ts'
import { getDB } from '../state/db.ts'
import { wsHub as hub } from '../ws/hub.ts'
import { backupCoordinator } from '../backup/coordinator.ts'
import { createLogger } from '../lib/logger.ts'
import { streamRegistry, type StreamTerminalState } from '../state/streams.ts'
import { parseChatControlRequest, parseChatSendRequest, readBody } from '../contracts/routes.ts'
import { AppError, badRequest, conflict, jsonError, notFound, success } from '../lib/errors.ts'
import { resolveCanonicalProjectId } from '../state/migrations.ts'
import { agentUrls, agentResolver } from '../state/agents.ts'
import { normalizeAgentUrl } from '../lib/agent-url.ts'
import { mapGetUserFailure } from '../lib/errors.ts'
import { getCorrelation, updateCorrelation, correlationLogBindings } from '../lib/correlation.ts'
import { resolveTerminalState, type StreamFSMContext } from '../services/streamStateMachine.ts'

const log = createLogger('chat')

export const chatRouter = new Hono()

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
    content: typeof payload.content === 'string' ? payload.content : JSON.stringify(payload.content ?? ''),
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
    throw notFound('Session not found', { sessionId: requestedSessionId })
  }

  if (sessionRow.project_id !== projectId) {
    throw badRequest('Session does not belong to this project')
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
  streamId: string,
  content: string,
  opts: {
    status: StreamTerminalState
    inputTokens: number
    outputTokens: number
    toolCalls?: any[]
    thinkingBlocks?: any[]
    requestId?: string
  },
) {
  const db = getDB()

  const result = db.prepare(`
    INSERT OR IGNORE INTO messages
      (id, session_id, role, content, input_tokens, output_tokens, tool_calls, reasoning, status, stream_id, request_id, created_at)
    VALUES (?, ?, 'assistant', ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    crypto.randomUUID(),
    sessionId,
    content,
    opts.inputTokens,
    opts.outputTokens,
    opts.toolCalls?.length ? JSON.stringify(opts.toolCalls) : null,
    opts.thinkingBlocks?.length ? JSON.stringify(opts.thinkingBlocks) : null,
    opts.status,
    streamId,
    opts.requestId || null,
  )

  if (result.changes === 0) return false

  db.prepare(`
    UPDATE sessions
    SET
      message_count = message_count + 1,
      total_input_tokens = total_input_tokens + ?,
      total_output_tokens = total_output_tokens + ?,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(opts.inputTokens, opts.outputTokens, sessionId)

  return true
}

chatRouter.post('/', async (c) => {
  try {
    const body = await parseChatSendRequest(await readBody(c))

    const resolvedProject = resolveCanonicalProjectId(body.projectId)
    const projectId = resolvedProject.canonicalProjectId

    // Enrich correlation context with project_id
    updateCorrelation({ projectId })

    const providedAgentUrl = normalizeAgentUrl(body.agentUrl)
    const cachedAgentUrl = normalizeAgentUrl(agentUrls.get(projectId))

    const resolvedAgentUrl =
      cachedAgentUrl ||
      (providedAgentUrl
        ? providedAgentUrl
        : await agentResolver.resolve(projectId, async () => {
            const acquired = await cli.acquireSandbox(projectId)
            if (!acquired.ok) {
              throw mapGetUserFailure(acquired.error)
            }

            const links = acquired.data.links as any
            const agentUrl = normalizeAgentUrl(
              typeof links?.agentUrl === 'string' ? links.agentUrl : (links?.agentUrl?.url as unknown),
            )
            if (!agentUrl) {
              throw badRequest('Sandbox did not return an agentUrl')
            }

            return agentUrl
          }))

    if (providedAgentUrl && providedAgentUrl !== cachedAgentUrl) {
      agentUrls.set(projectId, providedAgentUrl)
    }

    const model = body.model?.trim() || 'claude-sonnet-4-6'
    const sessionId = ensureSession(projectId, model, body.prompt, body.sessionId)

    saveUserMessage(sessionId, body.prompt)

    // QA-128: Reject concurrent sends to the same session
    if (streamRegistry.has(sessionId)) {
      throw conflict('A stream is already active for this session. Please wait for it to complete or abort it first.')
    }

    const abortController = new AbortController()
    const stream = streamRegistry.register(sessionId, projectId, abortController)

    // Enrich correlation context with stream_id
    updateCorrelation({ streamId: stream.streamId })

    const correlation = getCorrelation()
    const requestId = correlation.requestId

    const startSequence = streamRegistry.nextSequence(sessionId, stream.streamId) ?? 1
    hub.broadcast(`project:${projectId}`, {
      type: 'chat:stream:start',
      sessionId,
      streamId: stream.streamId,
      requestId,
      sequence: startSequence,
    })

    void runStreamLifecycle({
      projectId,
      sessionId,
      streamId: stream.streamId,
      requestId,
      model,
      prompt: body.prompt,
      resolvedAgentUrl,
      abortController,
    })

    return c.json(success({ sessionId, streamId: stream.streamId, requestId, canonicalProjectId: projectId }))
  } catch (error) {
    return jsonError(c, error)
  }
})

async function runStreamLifecycle(opts: {
  projectId: string
  sessionId: string
  streamId: string
  requestId: string
  model: string
  prompt: string
  resolvedAgentUrl: string
  abortController: AbortController
}) {
  let inputTokens = 0
  let outputTokens = 0

  const fsm: StreamFSMContext = {
    sawDone: false,
    sawError: false,
    creditsExhausted: false,
    aborted: false,
    assistantText: '',
    errorMessage: null,
  }

  const toolCalls: Array<any> = []
  const thinkingBlocks: Array<{ summary?: string }> = []

  try {
    for await (const event of cli.agentSend(opts.resolvedAgentUrl, opts.model, opts.prompt, {
      signal: opts.abortController.signal,
    })) {
      const sequence = streamRegistry.nextSequence(opts.sessionId, opts.streamId)
      if (!sequence) {
        break
      }

      hub.broadcast(`project:${opts.projectId}`, {
        type: 'chat:event',
        sessionId: opts.sessionId,
        streamId: opts.streamId,
        requestId: opts.requestId,
        sequence,
        event,
      })

      const textChunk = extractTextChunk(event)
      if (textChunk) {
        fsm.assistantText += textChunk
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

      if (event.type === 'thinking' && event.thinking) {
        thinkingBlocks.push({ summary: event.thinking.summary })
      }

      if (event.type === 'done') {
        inputTokens = Number(event.input_tokens || 0)
        outputTokens = Number(event.output_tokens || 0)
        fsm.sawDone = true
      }

      if (event.type === 'credits_low') {
        const creditsSequence = streamRegistry.nextSequence(opts.sessionId, opts.streamId)
        if (creditsSequence) {
          hub.broadcast(`project:${opts.projectId}`, {
            type: 'credits:low',
            sequence: creditsSequence,
            streamId: opts.streamId,
            requestId: opts.requestId,
            balance: event.balance,
          })
        }
      }

      if (event.type === 'credits_exhausted') {
        fsm.creditsExhausted = true
        await backupCoordinator.backupNow(opts.projectId, { trigger: 'credits_exhausted', sessionId: opts.sessionId }).catch(() => {})

        const exhaustedSequence = streamRegistry.nextSequence(opts.sessionId, opts.streamId)
        if (exhaustedSequence) {
          hub.broadcast(`project:${opts.projectId}`, {
            type: 'credits:exhausted',
            sequence: exhaustedSequence,
            streamId: opts.streamId,
            requestId: opts.requestId,
            sessionId: opts.sessionId,
          })
        }

        break
      }

      if (event.type === 'error') {
        fsm.sawError = true
        fsm.errorMessage = event.error || 'Unknown stream error'
        break
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!opts.abortController.signal.aborted) {
      log.error({ sessionId: opts.sessionId, projectId: opts.projectId, requestId: opts.requestId, message }, 'stream failed')
      fsm.sawError = true
      fsm.errorMessage = message
    }
  }

  const stream = streamRegistry.get(opts.sessionId)
  fsm.aborted = !!(stream && stream.streamId === opts.streamId && stream.abortReason)

  const terminal = resolveTerminalState(fsm)

  const acceptedTerminal = streamRegistry.markTerminal(opts.sessionId, opts.streamId, terminal)
  if (acceptedTerminal) {
    if (fsm.assistantText || toolCalls.length > 0 || thinkingBlocks.length > 0 || terminal !== 'empty') {
      saveAssistantMessage(opts.sessionId, opts.streamId, fsm.assistantText, {
        status: terminal,
        inputTokens,
        outputTokens,
        toolCalls,
        thinkingBlocks,
        requestId: opts.requestId,
      })
    }

    const finalSequence = streamRegistry.nextSequence(opts.sessionId, opts.streamId)
    if (finalSequence) {
      hub.broadcast(`project:${opts.projectId}`, {
        type: 'chat:stream:end',
        sessionId: opts.sessionId,
        streamId: opts.streamId,
        requestId: opts.requestId,
        sequence: finalSequence,
        terminal,
        cutOff: terminal !== 'complete',
        empty: !fsm.assistantText,
        creditsExhausted: fsm.creditsExhausted,
        errorMessage: fsm.errorMessage,
      })
    }
  }

  streamRegistry.unregister(opts.sessionId, opts.streamId)
}

chatRouter.get('/sessions', async (c) => {
  try {
    const projectId = c.req.query('projectId')?.trim()
    if (!projectId) throw badRequest('projectId required')

    const resolvedProject = resolveCanonicalProjectId(projectId)

    const db = getDB()
    const rows = db.prepare(`
      SELECT s.*, COUNT(m.id) as message_count
      FROM sessions s
      LEFT JOIN messages m ON m.session_id = s.id
      WHERE s.project_id = ?
      GROUP BY s.id
      ORDER BY s.updated_at DESC
    `).all(resolvedProject.canonicalProjectId) as any[]

    return c.json(
      success({
        sessions: rows.map((row) => ({
          id: row.id,
          projectId: row.project_id,
          model: row.model,
          title: row.title,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          messageCount: row.message_count,
        })),
      }),
    )
  } catch (error) {
    return jsonError(c, error)
  }
})

chatRouter.get('/sessions/:id', async (c) => {
  try {
    const sessionId = c.req.param('id')
    if (!sessionId) throw badRequest('session id required')

    const db = getDB()

    const sessionRow = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as any
    if (!sessionRow) throw notFound('session not found')

    const messageRows = db.prepare(`
      SELECT *
      FROM messages
      WHERE session_id = ?
      ORDER BY created_at ASC
    `).all(sessionId) as any[]

    return c.json(
      success({
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
          streamId: row.stream_id,
          toolCalls: row.tool_calls ? JSON.parse(row.tool_calls) : undefined,
          thinkingBlocks: row.reasoning ? JSON.parse(row.reasoning) : undefined,
        })),
      }),
    )
  } catch (error) {
    return jsonError(c, error)
  }
})

chatRouter.get('/sessions/:id/stream-status', async (c) => {
  try {
    const sessionId = c.req.param('id')
    if (!sessionId) throw badRequest('session id required')

    // Check if stream is currently active
    const activeStream = streamRegistry.get(sessionId)
    if (activeStream) {
      return c.json(success({
        active: true,
        streamId: activeStream.streamId,
        terminalState: null,
        canRetry: false,
        canContinue: false,
      }))
    }

    // Check last assistant message for terminal state
    const db = getDB()
    const lastAssistant = db.prepare(
      "SELECT status, stream_id FROM messages WHERE session_id = ? AND role = 'assistant' ORDER BY created_at DESC LIMIT 1"
    ).get(sessionId) as { status: string; stream_id: string | null } | undefined

    if (!lastAssistant) {
      return c.json(success({
        active: false,
        streamId: null,
        terminalState: null,
        canRetry: true,
        canContinue: false,
      }))
    }

    const terminalState = lastAssistant.status as StreamTerminalState
    const isTerminal = ['complete', 'cut_off', 'empty', 'error', 'aborted'].includes(terminalState)

    return c.json(success({
      active: false,
      streamId: lastAssistant.stream_id,
      terminalState: isTerminal ? terminalState : null,
      canRetry: isTerminal && terminalState !== 'complete',
      canContinue: isTerminal && terminalState === 'cut_off',
    }))
  } catch (error) {
    return jsonError(c, error)
  }
})

chatRouter.delete('/sessions/:id', async (c) => {
  try {
    const sessionId = c.req.param('id')
    if (!sessionId) throw badRequest('session id required')

    const db = getDB()

    db.prepare('DELETE FROM messages WHERE session_id = ?').run(sessionId)
    db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId)

    return c.json(success({ ok: true }))
  } catch (error) {
    return jsonError(c, error)
  }
})

chatRouter.post('/sessions/:id/export', async (c) => {
  try {
    const sessionId = c.req.param('id')
    if (!sessionId) throw badRequest('session id required')

    const db = getDB()

    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as any
    if (!session) throw notFound('session not found')

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
  } catch (error) {
    if (error instanceof AppError) {
      return jsonError(c, error)
    }

    return jsonError(c, error)
  }
})

chatRouter.post('/abort', async (c) => {
  try {
    const body = await parseChatControlRequest(await readBody(c))
    const result = streamRegistry.requestAbort(body.sessionId, 'user aborted')

    return c.json(
      success({
        ok: true,
        aborted: result.accepted,
      }),
    )
  } catch (error) {
    return jsonError(c, error)
  }
})

chatRouter.post('/stop', async (c) => {
  try {
    const body = await parseChatControlRequest(await readBody(c))

    const active = streamRegistry.get(body.sessionId)
    if (!active) {
      return c.json(success({ ok: true, stopped: false, reason: 'no active stream' }))
    }

    streamRegistry.requestAbort(body.sessionId, 'user stopped')

    const agentUrl = normalizeAgentUrl(agentUrls.get(active.projectId))
    if (!agentUrl) {
      return c.json(success({ ok: true, stopped: false, reason: 'no agentUrl' }))
    }

    const result = await cli.agentStop(agentUrl)
    if (!result.ok) {
      throw new AppError('DEPENDENCY_ERROR', result.error.message || 'Failed to stop agent', 502)
    }

    return c.json(success({ ok: true, stopped: !!result.data.stopped }))
  } catch (error) {
    return jsonError(c, error)
  }
})
