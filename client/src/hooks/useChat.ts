import { useState, useCallback } from 'react'
import { api } from '../lib/api'
import { useChatStore } from '../store/chat'

export function useChat(projectId: string | null) {
  const { model, activeSessionId, setActiveSession, addMessage, setStreaming, setCreditsExhausted, setMessages } = useChatStore()
  const [sending, setSending] = useState(false)

  const sendMessage = useCallback(async (prompt: string) => {
    if (!projectId || !prompt.trim() || sending) return

    setSending(true)
    const msgId = crypto.randomUUID()
    addMessage({ id: msgId, role: 'user', content: prompt, createdAt: new Date().toISOString() })
    setStreaming(true)

    try {
      const agentUrl = (window as any).__agentUrl
      const response = await api.sendMessage({
        projectId, model, prompt: prompt.trim(),
        sessionId: activeSessionId ?? undefined,
        agentUrl,
      })
      if (!activeSessionId && response.sessionId) {
        setActiveSession(response.sessionId)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const lower = msg.toLowerCase()
      if (lower.includes('credit') || lower.includes('exhaust') || msg.includes('402')) {
        setCreditsExhausted(true)
      }
      setStreaming(false)
      console.error('[useChat] sendMessage error:', msg)
    } finally {
      setSending(false)
    }
  }, [projectId, model, activeSessionId, sending])

  // Retry: strip last user+assistant pair, re-send the user prompt
  const retryMessage = useCallback(async () => {
    const msgs = useChatStore.getState().messages
    let lastUserIdx = -1
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'user') { lastUserIdx = i; break }
    }
    if (lastUserIdx === -1) return
    const prompt = msgs[lastUserIdx].content
    setMessages(msgs.slice(0, lastUserIdx))
    await sendMessage(prompt)
  }, [sendMessage, setMessages])

  // Continue: ask model to continue from where it was cut off
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

  return { sendMessage, retryMessage, continueMessage, loadSession, sending }
}
