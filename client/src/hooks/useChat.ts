import { useCallback, useRef } from 'react'
import { api } from '../lib/api'
import { useChatStore } from '../store/chat'

export function useChat(projectId: string | null) {
  const model = useChatStore((state) => state.model)
  const sendingRef = useRef(false)

  const sendMessage = useCallback(
    async (prompt: string, sessionId?: string | null) => {
      if (!projectId) return
      if (!prompt.trim()) return
      if (sendingRef.current) return

      sendingRef.current = true

      const chatStore = useChatStore.getState()
      const userMessageId = crypto.randomUUID()
      const activeSessionId = chatStore.activeSessionId

      chatStore.addMessage({
        id: userMessageId,
        role: 'user',
        content: prompt,
        createdAt: new Date().toISOString(),
      })
      chatStore.setStreaming(true)

      try {
        const resolvedSessionId =
          sessionId === undefined
            ? activeSessionId ?? undefined
            : sessionId ?? undefined

        const response = await api.sendMessage({
          projectId,
          model,
          prompt: prompt.trim(),
          sessionId: resolvedSessionId,
          agentUrl: (window as any).__agentUrl,
        })

        if (response.sessionId && chatStore.activeSessionId !== response.sessionId) {
          chatStore.setActiveSession(response.sessionId)
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        const lower = message.toLowerCase()

        if (lower.includes('credit') || lower.includes('exhaust') || lower.includes('402')) {
          chatStore.setCreditsExhausted(true)
        }

        chatStore.setStreaming(false)
        throw err
      } finally {
        sendingRef.current = false
      }
    },
    [model, projectId],
  )

  const retryFromIndex = useCallback(
    async (userMessageIndex: number) => {
      const state = useChatStore.getState()
      const message = state.messages[userMessageIndex]
      if (!message || message.role !== 'user') return

      state.setMessages(state.messages.slice(0, userMessageIndex))
      state.setActiveSession(null)
      await sendMessage(message.content, null)
    },
    [sendMessage],
  )

  const continueMessage = useCallback(async () => {
    const state = useChatStore.getState()
    const last = state.messages[state.messages.length - 1]

    if (!last || last.role !== 'assistant' || !last.cutOff) return

    const tail = last.content.slice(-300).trim()
    const continuationPrompt = tail
      ? `Please continue your response from where you left off. Your last words were: "...${tail}"`
      : 'Please continue your previous response from where you left off.'

    await sendMessage(continuationPrompt)
  }, [sendMessage])

  const loadSession = useCallback(async (sessionId: string) => {
    const response = await api.getSession(sessionId)

    if (!Array.isArray(response.messages)) {
      throw new Error('Invalid session payload')
    }

    const mapped = response.messages.map((message: any) => ({
      id: String(message.id),
      role: message.role,
      content: message.content,
      createdAt: message.createdAt || message.created_at || new Date().toISOString(),
      inputTokens: message.inputTokens ?? message.input_tokens,
      outputTokens: message.outputTokens ?? message.output_tokens,
      cutOff: message.status === 'cut_off' || message.status === 'error' || message.status === 'empty',
    }))

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
