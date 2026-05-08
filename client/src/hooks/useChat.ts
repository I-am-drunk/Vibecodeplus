import { useCallback, useRef } from 'react'
import { api } from '../lib/api'
import { useChatStore, type Message } from '../store/chat'

export function resolveRetryUserIndex(messages: Message[], requestedIndex: number): number {
  if (!messages.length) return -1

  let cursor = requestedIndex
  if (cursor >= messages.length) cursor = messages.length - 1
  if (cursor < 0) cursor = messages.length - 1

  for (let index = cursor; index >= 0; index -= 1) {
    if (messages[index].role === 'user') return index
  }

  return -1
}

export function useChat(projectId: string | null) {
  const model = useChatStore((state) => state.model)
  const sendingRef = useRef(false)

  const sendMessage = useCallback(
    async (prompt: string, sessionId?: string | null, opts?: { isContinuation?: boolean; appendMessageId?: string }) => {
      if (!projectId) return
      if (!prompt.trim()) return
      if (sendingRef.current) return

      sendingRef.current = true

      const chatStore = useChatStore.getState()
      const userMessageId = crypto.randomUUID()
      const activeSessionId = chatStore.activeSessionId

      if (!opts?.isContinuation) {
        chatStore.addMessage({
          id: userMessageId,
          role: 'user',
          content: prompt,
          createdAt: new Date().toISOString(),
        })
      }
      chatStore.setStreaming(true)

      try {
        const resolvedSessionId = sessionId === undefined ? activeSessionId ?? undefined : sessionId ?? undefined

        const response = await api.sendMessage({
          projectId,
          model,
          prompt: prompt.trim(),
          sessionId: resolvedSessionId,
          agentUrl: (window as any).__agentUrl,
          messageId: userMessageId,
          isContinuation: opts?.isContinuation,
          appendMessageId: opts?.appendMessageId,
        })

        if (response.canonicalProjectId && response.canonicalProjectId !== projectId) {
          window.history.replaceState(null, '', `/workspace/${response.canonicalProjectId}`)
        }

        if (response.sessionId && chatStore.activeSessionId !== response.sessionId) {
          chatStore.setActiveSession(response.sessionId)
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const lower = message.toLowerCase()

        if (lower.includes('credit') || lower.includes('exhaust') || lower.includes('402')) {
          chatStore.setCreditsExhausted(true)
        }

        chatStore.setStreaming(false)
        throw error
      } finally {
        sendingRef.current = false
      }
    },
    [model, projectId],
  )

  const retryFromIndex = useCallback(
    async (requestedIndex: number) => {
      const state = useChatStore.getState()
      const retryIndex = resolveRetryUserIndex(state.messages, requestedIndex)
      if (retryIndex < 0) return

      const retryMessage = state.messages[retryIndex]
      if (!retryMessage || retryMessage.role !== 'user') return

      const previousMessages = state.messages
      const previousSessionId = state.activeSessionId
      const previousToolCalls = state.toolCalls

      state.setMessages(state.messages.slice(0, retryIndex))
      state.clearToolCalls()
      state.setStreaming(false)

      try {
        await sendMessage(retryMessage.content, previousSessionId)
      } catch (error) {
        state.setMessages(previousMessages)
        state.setActiveSession(previousSessionId)
        for (const toolCall of previousToolCalls) {
          state.addToolCall(toolCall)
        }
        state.setStreaming(false)
        throw error
      }
    },
    [sendMessage],
  )

  const continueMessage = useCallback(async () => {
    const state = useChatStore.getState()
    const last = state.messages[state.messages.length - 1]

    if (!last || last.role !== 'assistant' || !last.cutOff) return

    const tail = last.content.slice(-300).trim()
    const continuationPrompt = tail
      ? `Please continue your response exactly from where you left off. Your last words were: "...${tail}"`
      : 'Please continue...'

    await sendMessage(continuationPrompt, state.activeSessionId, { isContinuation: true, appendMessageId: last.id })
  }, [sendMessage])

  const loadSession = useCallback(async (sessionId: string) => {
    const response = await api.getSession(sessionId)

    if (!Array.isArray(response.messages)) {
      throw new Error('Invalid session payload')
    }

    const mapped = response.messages.map((message: any) => {
      const terminal = message.status as Message['terminalStatus']
      return {
        id: String(message.id),
        role: message.role,
        content: message.content,
        createdAt: message.createdAt || message.created_at || new Date().toISOString(),
        inputTokens: message.inputTokens ?? message.input_tokens,
        outputTokens: message.outputTokens ?? message.output_tokens,
        cutOff: message.status !== 'complete',
        terminalStatus: terminal,
      } satisfies Message
    })

    const chatStore = useChatStore.getState()
    chatStore.setMessages(mapped)
    chatStore.setActiveSession(sessionId)
    chatStore.setStreaming(false)
  }, [])

  return {
    sendMessage,
    retryFromIndex,
    continueMessage,
    loadSession,
    sending: sendingRef.current,
  }
}
