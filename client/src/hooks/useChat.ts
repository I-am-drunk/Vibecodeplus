import { useRef, useCallback } from 'react'
import { api } from '../lib/api'
import { useChatStore } from '../store/chat'

export function useChat(projectId: string | null) {
  const { model, setActiveSession, addMessage, setStreaming, setCreditsExhausted, setMessages } = useChatStore()
  // Use a ref for sending so callbacks never go stale
  const sendingRef = useRef(false)

  const sendMessage = useCallback(async (prompt: string, sessionId?: string | null) => {
    if (!projectId || !prompt.trim() || sendingRef.current) return
    sendingRef.current = true

    const msgId = crypto.randomUUID()
    addMessage({ id: msgId, role: 'user', content: prompt, createdAt: new Date().toISOString() })
    setStreaming(true)

    try {
      const agentUrl = (window as any).__agentUrl
      // Read activeSessionId fresh from store at call time
      const currentSessionId = useChatStore.getState().activeSessionId
      // sessionId arg overrides store value (pass null to force new session)
      const sid = sessionId === undefined ? (currentSessionId ?? undefined) : (sessionId ?? undefined)
      const response = await api.sendMessage({
        projectId, model, prompt: prompt.trim(),
        sessionId: sid,
        agentUrl,
      })
      if (!currentSessionId && response.sessionId) {
        setActiveSession(response.sessionId)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.toLowerCase().includes('credit') || msg.toLowerCase().includes('exhaust') || msg.includes('402')) {
        setCreditsExhausted(true)
      }
      setStreaming(false)
      console.error('[useChat] sendMessage error:', msg)
    } finally {
      sendingRef.current = false
    }
  }, [projectId, model])

  // Retry from a specific message index: strip that message and everything after, start fresh session
  const retryFromIndex = useCallback(async (userMsgIndex: number) => {
    const msgs = useChatStore.getState().messages
    const msg = msgs[userMsgIndex]
    if (!msg || msg.role !== 'user') return
    const prompt = msg.content
    // Keep everything before this user message
    setMessages(msgs.slice(0, userMsgIndex))
    // Force new session so server state matches client state
    setActiveSession(null)
    await sendMessage(prompt, null)
  }, [sendMessage, setMessages, setActiveSession])

  // Continue: ask model to continue from the last cut-off assistant message
  const continueMessage = useCallback(async () => {
    const msgs = useChatStore.getState().messages
    const last = msgs[msgs.length - 1]
    if (!last || last.role !== 'assistant' || !last.cutOff) return
    const tail = last.content.slice(-300).trim()
    await sendMessage(`Please continue your response from where you left off. Your last words were: "...${tail}"`)
  }, [sendMessage])

  const loadSession = useCallback(async (sessionId: string) => {
    try {
      const { messages } = await api.getSession(sessionId)
      if (!Array.isArray(messages)) throw new Error('Invalid messages')
      const mapped = messages.map((m: any) => ({
        id: String(m.id),
        role: m.role,
        content: m.content,
        createdAt: m.createdAt || m.created_at || new Date().toISOString(),
        inputTokens: m.inputTokens || m.input_tokens,
        outputTokens: m.outputTokens || m.output_tokens,
        cutOff: m.status === 'cut_off',
      }))
      useChatStore.getState().setMessages(mapped)
      setActiveSession(sessionId)
    } catch (err) {
      console.error('[useChat] loadSession error:', err)
      throw err
    }
  }, [])

  return { sendMessage, retryFromIndex, continueMessage, loadSession, sending: sendingRef.current }
}
