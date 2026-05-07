import { create } from 'zustand'
import { addClientLog } from '../lib/serverLogs'

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
  inputTokens?: number
  outputTokens?: number
  streaming?: boolean
}

export interface ChatSession {
  id: string
  projectId: string
  model: string
  title: string
  createdAt: string
  updatedAt: string
  messageCount?: number
}

interface ChatState {
  sessions: ChatSession[]
  activeSessionId: string | null
  messages: Message[]
  streamingText: string
  isStreaming: boolean
  creditsExhausted: boolean
  model: string

  setSessions: (sessions: ChatSession[]) => void
  setActiveSession: (id: string | null) => void
  setMessages: (messages: Message[]) => void
  addMessage: (msg: Message) => void
  appendStreamText: (text: string) => void
  finalizeStream: (content: string) => void
  setStreaming: (v: boolean) => void
  setCreditsExhausted: (v: boolean) => void
  setModel: (model: string) => void
  reset: () => void
}

export const useChatStore = create<ChatState>((set) => ({
  sessions: [],
  activeSessionId: null,
  messages: [],
  streamingText: '',
  isStreaming: false,
  creditsExhausted: false,
  model: 'claude-sonnet-4-6',

  setSessions: (sessions) => {
    addClientLog('chatStore', 'setSessions called', { count: sessions.length })
    set({ sessions })
    addClientLog('chatStore', 'setSessions state updated')
  },
  setActiveSession: (id) => {
    const prev = useChatStore.getState().activeSessionId
    addClientLog('chatStore', 'setActiveSession called', { id, previousId: prev })
    set({ activeSessionId: id })
    addClientLog('chatStore', 'setActiveSession state updated', { newId: id })
  },
  setMessages: (messages) => {
    const prevCount = useChatStore.getState().messages.length
    addClientLog('chatStore', 'setMessages called', { count: messages.length, previousCount: prevCount })
    set({ messages })
    addClientLog('chatStore', 'setMessages state updated')
  },
  addMessage: (msg) => {
    const prevCount = useChatStore.getState().messages.length
    addClientLog('chatStore', 'addMessage called', { msgId: msg.id, role: msg.role, previousCount: prevCount })
    set(s => {
      const newMessages = [...s.messages, msg]
      addClientLog('chatStore', 'addMessage new count', { count: newMessages.length })
      return { messages: newMessages }
    })
    addClientLog('chatStore', 'addMessage state updated')
  },
  appendStreamText: (text) => {
    addClientLog('chatStore', 'appendStreamText', { textLength: text.length })
    set(s => {
      const newText = s.streamingText + text
      addClientLog('chatStore', 'appendStreamText new length', { length: newText.length })
      return { streamingText: newText }
    })
  },
  finalizeStream: (content) => {
    const prevCount = useChatStore.getState().messages.length
    addClientLog('chatStore', 'finalizeStream called', { contentLength: content.length, previousMessageCount: prevCount })
    const msgId = crypto.randomUUID()
    const createdAt = new Date().toISOString()
    addClientLog('chatStore', 'finalizeStream creating assistant message', { msgId, createdAt })
    set(s => ({
      streamingText: '',
      isStreaming: false,
      messages: [...s.messages, {
        id: msgId,
        role: 'assistant',
        content,
        createdAt,
      }],
    }))
    const newCount = useChatStore.getState().messages.length
    addClientLog('chatStore', 'finalizeStream state updated', { newMessageCount: newCount })
  },
  setStreaming: (v) => {
    const prev = useChatStore.getState().isStreaming
    addClientLog('chatStore', 'setStreaming called', { value: v, previousValue: prev })
    set({ isStreaming: v })
    addClientLog('chatStore', 'setStreaming state updated')
  },
  setCreditsExhausted: (v) => {
    addClientLog('chatStore', 'setCreditsExhausted called', { value: v })
    set({ creditsExhausted: v })
  },
  setModel: (model) => {
    const prev = useChatStore.getState().model
    addClientLog('chatStore', 'setModel called', { model, previousModel: prev })
    set({ model })
    addClientLog('chatStore', 'setModel state updated')
  },
  reset: () => {
    const prev = useChatStore.getState()
    addClientLog('chatStore', 'reset called - clearing all state', {
      prevSessions: prev.sessions.length,
      prevActiveSessionId: prev.activeSessionId,
      prevMessages: prev.messages.length,
      prevStreamingText: prev.streamingText.length,
      prevIsStreaming: prev.isStreaming,
    })
    set({ sessions: [], activeSessionId: null, messages: [], streamingText: '', isStreaming: false })
    addClientLog('chatStore', 'reset state cleared')
  },
}))

