import { useEffect } from 'react'
import { closeProjectWS, getProjectWS } from '../lib/ws'
import { useChatStore } from '../store/chat'
import { useAuthStore } from '../store/auth'
import { useWorkspaceStore } from '../store/workspace'

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
    result:
      typeof payload.content === 'string'
        ? payload.content
        : JSON.stringify(payload.content ?? ''),
    status: payload.is_error ? 'error' as const : 'success' as const,
  }
}

export function useProjectEvents(projectId: string | null) {
  useEffect(() => {
    if (!projectId) return

    let disposed = false
    let reconnectTimer: number | undefined
    let socket: WebSocket | null = null
    let teardown: (() => void) | undefined
    const streamBufferBySession = new Map<string, string>()

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
            if (sessionId) {
              streamBufferBySession.set(sessionId, '')
              chatStore.setActiveSession(sessionId)
            }
            chatStore.clearToolCalls()
            chatStore.setStreaming(true)
            break
          }

          case 'chat:event': {
            const sessionId = String(event.sessionId || chatStore.activeSessionId || '')
            const payload = event.event

            if (!payload) break

            const textChunk = extractTextChunk(payload)
            if (textChunk) {
              const previous = streamBufferBySession.get(sessionId) || ''
              streamBufferBySession.set(sessionId, previous + textChunk)
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
            const content = streamBufferBySession.get(sessionId) || ''

            chatStore.finalizeStream(content, !!event.cutOff)
            chatStore.setStreaming(false)
            streamBufferBySession.delete(sessionId)

            if (event.creditsExhausted) chatStore.setCreditsExhausted(true)
            workspaceStore.notifyFileChanged()
            break
          }

          case 'chat:stream:error': {
            const sessionId = String(event.sessionId || chatStore.activeSessionId || '')
            const content = streamBufferBySession.get(sessionId) || ''

            chatStore.finalizeStream(content, true)
            chatStore.setStreaming(false)
            streamBufferBySession.delete(sessionId)
            break
          }

          case 'chat:aborted': {
            const sessionId = String(event.sessionId || chatStore.activeSessionId || '')
            const content = streamBufferBySession.get(sessionId) || ''
            chatStore.finalizeStream(content, true)
            chatStore.setStreaming(false)
            streamBufferBySession.delete(sessionId)
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

        reconnectTimer = window.setTimeout(() => {
          connect()
        }, 1200)
      }

      socket.addEventListener('message', onMessage)
      socket.addEventListener('close', onClose)
      socket.addEventListener('error', onClose)

      teardown = () => {
        socket?.removeEventListener('message', onMessage)
        socket?.removeEventListener('close', onClose)
        socket?.removeEventListener('error', onClose)
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
