import { useEffect } from 'react'
import { closeProjectWS, getProjectWS } from '../lib/ws'
import { useChatStore } from '../store/chat'
import { useAuthStore } from '../store/auth'
import { useWorkspaceStore } from '../store/workspace'
import { createStreamLifecycleGuard } from '../lib/streamLifecycle'

function extractTextChunk(event: any): string {
  if (typeof event?.text === 'string') return event.text
  if (typeof event?.delta === 'string') return event.delta
  if (typeof event?.content === 'string' && event.type === 'text') return event.content
  if (typeof event?.text?.delta === 'string') return event.text.delta
  return ''
}

function parseToolUse(event: any) {
  if (event?.type !== 'tool_use') return null
  const payload = event.tool_use ?? event
  if (!payload?.id || !payload?.name) return null
  return {
    id: String(payload.id),
    name: String(payload.name),
    input: payload.input ?? {},
    status: 'running' as const,
  }
}

function parseToolResult(event: any) {
  if (event?.type !== 'tool_result') return null
  const payload = event.tool_result ?? event
  if (!payload?.tool_use_id) return null
  return {
    id: String(payload.tool_use_id),
    result: typeof payload.content === 'string' ? payload.content : JSON.stringify(payload.content ?? ''),
    status: payload.is_error ? ('error' as const) : ('success' as const),
  }
}

function normalizeTerminal(rawTerminal: unknown): 'complete' | 'cut_off' | 'empty' | 'error' | 'aborted' {
  if (rawTerminal === 'complete') return 'complete'
  if (rawTerminal === 'error') return 'error'
  if (rawTerminal === 'empty') return 'empty'
  if (rawTerminal === 'aborted') return 'aborted'
  return 'cut_off'
}

export function useProjectEvents(projectId: string | null) {
  useEffect(() => {
    if (!projectId) return

    let disposed = false
    let reconnectTimer: number | undefined
    let reconnectAttempt = 0
    let socket: WebSocket | null = null
    let teardown: (() => void) | undefined

    const streamGuard = createStreamLifecycleGuard()
    const streamBufferById = new Map<string, string>()

    const connect = () => {
      if (disposed) return

      if (teardown) teardown()
      socket = getProjectWS(projectId)

      const onMessage = (messageEvent: MessageEvent) => {
        let event: any
        try {
          event = JSON.parse(messageEvent.data)
        } catch {
          return
        }

        const chatStore = useChatStore.getState()
        const authStore = useAuthStore.getState()
        const workspaceStore = useWorkspaceStore.getState()

        switch (event.type) {
          case 'chat:stream:start': {
            const sessionId = String(event.sessionId || chatStore.activeSessionId || '')
            const streamId = String(event.streamId || sessionId)
            const sequence = Number(event.sequence || 0)
            if (!sessionId || !streamId) break

            const accepted = streamGuard.start(sessionId, streamId, sequence)
            if (!accepted.accepted) break

            streamBufferById.set(streamId, '')
            chatStore.setActiveSession(sessionId)
            chatStore.beginStream({ sessionId, streamId })
            break
          }

          case 'chat:event': {
            const sessionId = String(event.sessionId || chatStore.activeSessionId || '')
            const streamId = String(event.streamId || sessionId)
            const sequence = Number(event.sequence || 0)
            const payload = event.event

            if (!payload || !sessionId || !streamId) break

            let accepted = streamGuard.acceptEvent(sessionId, streamId, sequence)
            if (!accepted.accepted && accepted.reason === 'missing') {
              const started = streamGuard.start(sessionId, streamId, Math.max(sequence - 1, 0))
              if (started.accepted) {
                chatStore.setActiveSession(sessionId)
                chatStore.beginStream({ sessionId, streamId })
                accepted = streamGuard.acceptEvent(sessionId, streamId, sequence)
              }
            }

            if (!accepted.accepted) break

            const textChunk = extractTextChunk(payload)
            if (textChunk) {
              const previous = streamBufferById.get(streamId) || ''
              streamBufferById.set(streamId, previous + textChunk)
              chatStore.appendStreamText(textChunk)
            }

            const toolUse = parseToolUse(payload)
            if (toolUse) chatStore.addToolCall(toolUse)

            const toolResult = parseToolResult(payload)
            if (toolResult) {
              chatStore.updateToolCall(toolResult.id, {
                result: toolResult.result,
                status: toolResult.status,
              })
            }

            break
          }

          case 'chat:stream:end': {
            const sessionId = String(event.sessionId || chatStore.activeSessionId || '')
            const streamId = String(event.streamId || sessionId)
            const sequence = Number(event.sequence || 0)
            const terminal = normalizeTerminal(event.terminal)

            if (!sessionId || !streamId) break

            const accepted = streamGuard.acceptTerminal(sessionId, streamId, sequence, terminal)
            if (!accepted.accepted) break

            const content = streamBufferById.get(streamId) || ''

            chatStore.finalizeStream({
              sessionId,
              streamId,
              content,
              terminal,
              errorMessage: typeof event.errorMessage === 'string' ? event.errorMessage : undefined,
            })
            streamBufferById.delete(streamId)
            streamGuard.clearSession(sessionId)

            if (event.creditsExhausted) chatStore.setCreditsExhausted(true)
            workspaceStore.notifyFileChanged()
            break
          }

          case 'chat:stream:error':
          case 'chat:aborted': {
            const sessionId = String(event.sessionId || chatStore.activeSessionId || '')
            const streamId = String(event.streamId || sessionId)
            const sequence = Number(event.sequence || 0)

            if (!sessionId || !streamId) break

            const terminal = event.type === 'chat:aborted' ? 'aborted' : 'error'
            const accepted = streamGuard.acceptTerminal(sessionId, streamId, sequence, terminal)
            if (!accepted.accepted) break

            const content = streamBufferById.get(streamId) || ''
            chatStore.finalizeStream({
              sessionId,
              streamId,
              content,
              terminal,
              errorMessage: typeof event.errorMessage === 'string' ? event.errorMessage : undefined,
            })
            streamBufferById.delete(streamId)
            streamGuard.clearSession(sessionId)
            break
          }

          case 'credits:exhausted':
            chatStore.setCreditsExhausted(true)
            break

          case 'credits:update':
            if (event.credits) authStore.setCredits(event.credits)
            break

          case 'file:changed':
            workspaceStore.notifyFileChanged()
            break

          default:
            break
        }
      }

      const onClose = () => {
        if (disposed) return

        reconnectAttempt += 1
        const delay = Math.min(1000 * 2 ** (reconnectAttempt - 1), 10_000)

        reconnectTimer = window.setTimeout(() => {
          connect()
        }, delay)
      }

      const onOpen = () => {
        reconnectAttempt = 0
      }

      socket.addEventListener('message', onMessage)
      socket.addEventListener('close', onClose)
      socket.addEventListener('error', onClose)
      socket.addEventListener('open', onOpen)

      teardown = () => {
        socket?.removeEventListener('message', onMessage)
        socket?.removeEventListener('close', onClose)
        socket?.removeEventListener('error', onClose)
        socket?.removeEventListener('open', onOpen)
      }
    }

    connect()

    return () => {
      disposed = true
      if (reconnectTimer) window.clearTimeout(reconnectTimer)
      if (teardown) teardown()
      closeProjectWS(projectId)
      useChatStore.getState().setStreaming(false)
    }
  }, [projectId])
}
