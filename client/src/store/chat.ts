import { create } from 'zustand'

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
  inputTokens?: number
  outputTokens?: number
  streaming?: boolean
  cutOff?: boolean
  terminalStatus?: 'complete' | 'cut_off' | 'empty' | 'error' | 'aborted'
}

export interface ToolCall {
  id: string
  name: string
  input: unknown
  result?: string
  status: 'running' | 'success' | 'error'
  messageId?: string
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

interface StreamFinalizeParams {
  sessionId?: string | null
  streamId?: string | null
  content: string
  terminal: 'complete' | 'cut_off' | 'empty' | 'error' | 'aborted'
  errorMessage?: string | null
}

interface ChatState {
  sessions: ChatSession[]
  activeSessionId: string | null
  messages: Message[]
  streamingText: string
  isStreaming: boolean
  creditsExhausted: boolean
  model: string
  toolCalls: ToolCall[]
  activeStreamId: string | null
  streamingSessionId: string | null
  finalizedStreamIds: Set<string>
  streamError: string | null

  setSessions: (sessions: ChatSession[]) => void
  setActiveSession: (id: string | null) => void
  setMessages: (messages: Message[]) => void
  addMessage: (msg: Message) => void
  beginStream: (params: { sessionId: string; streamId: string }) => void
  appendStreamText: (text: string) => void
  finalizeStream: (params: StreamFinalizeParams) => void
  failActiveStream: (errorMessage: string) => void
  setStreaming: (value: boolean) => void
  setCreditsExhausted: (value: boolean) => void
  setModel: (model: string) => void
  addToolCall: (toolCall: ToolCall) => void
  updateToolCall: (id: string, updates: Partial<ToolCall>) => void
  clearToolCalls: () => void
  reset: () => void
}

export const useChatStore = create<ChatState>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  messages: [],
  streamingText: '',
  isStreaming: false,
  creditsExhausted: false,
  model: 'claude-sonnet-4-6',
  toolCalls: [],
  activeStreamId: null,
  streamingSessionId: null,
  finalizedStreamIds: new Set(),
  streamError: null,

  setSessions: (sessions) => set({ sessions }),

  setActiveSession: (id) => {
    set({ activeSessionId: id })
    if (id) {
      localStorage.setItem('activeSessionId', id)
    } else {
      localStorage.removeItem('activeSessionId')
    }
  },

  setMessages: (messages) => set({ messages }),

  addMessage: (msg) => set((state) => ({ messages: [...state.messages, msg] })),

  beginStream: ({ sessionId, streamId }) =>
    set(() => ({
      streamingSessionId: sessionId,
      activeStreamId: streamId,
      isStreaming: true,
      streamingText: '',
      toolCalls: [],
      streamError: null,
    })),

  appendStreamText: (text) => set((state) => ({ streamingText: state.streamingText + text })),

  finalizeStream: ({ content, terminal, streamId, sessionId, errorMessage }) =>
    set((state) => {
      if (streamId && state.finalizedStreamIds.has(streamId)) {
        return {
          isStreaming: false,
          streamingText: '',
          activeStreamId: null,
          streamingSessionId: null,
          streamError: terminal === 'error' ? (errorMessage ?? state.streamError) : null,
        }
      }

      const resolvedContent =
        content ||
        (terminal === 'error'
          ? errorMessage ?? 'The assistant could not complete this response. Please retry.'
          : terminal === 'aborted'
            ? errorMessage ?? 'Generation stopped.'
            : '')

      const hasContent = Boolean(resolvedContent)
      const hasUnassignedToolCalls = state.toolCalls.some((toolCall) => !toolCall.messageId)
      const shouldPersistMessage = hasContent || hasUnassignedToolCalls || terminal !== 'empty'

      const nextFinalized = new Set(state.finalizedStreamIds)
      if (streamId) {
        nextFinalized.add(streamId)
        if (nextFinalized.size > 3000) {
          const first = nextFinalized.values().next().value
          if (first) nextFinalized.delete(first)
        }
      }

      if (!shouldPersistMessage) {
        return {
          isStreaming: false,
          streamingText: '',
          activeStreamId: null,
          streamingSessionId: null,
          finalizedStreamIds: nextFinalized,
          streamError: terminal === 'error' ? (errorMessage ?? null) : null,
        }
      }

      const messageId = crypto.randomUUID()
      const assistantMessage: Message = {
        id: messageId,
        role: 'assistant',
        content: resolvedContent,
        createdAt: new Date().toISOString(),
        cutOff: terminal !== 'complete',
        terminalStatus: terminal,
      }

      return {
        streamingText: '',
        isStreaming: false,
        activeStreamId: null,
        streamingSessionId: null,
        finalizedStreamIds: nextFinalized,
        messages: [...state.messages, assistantMessage],
        activeSessionId: sessionId ?? state.activeSessionId,
        streamError: terminal === 'error' ? (errorMessage ?? null) : null,
        toolCalls: state.toolCalls.map((toolCall) =>
          toolCall.messageId ? toolCall : { ...toolCall, messageId },
        ),
      }
    }),

  failActiveStream: (errorMessage) => {
    const state = get()
    if (!state.isStreaming) return

    get().finalizeStream({
      sessionId: state.streamingSessionId,
      streamId: state.activeStreamId,
      content: state.streamingText,
      terminal: 'error',
      errorMessage,
    })
  },

  setStreaming: (value) =>
    set((state) => ({
      isStreaming: value,
      streamingText: value ? state.streamingText : '',
      activeStreamId: value ? state.activeStreamId : null,
      streamingSessionId: value ? state.streamingSessionId : null,
      streamError: value ? state.streamError : null,
    })),

  setCreditsExhausted: (value) => set({ creditsExhausted: value }),

  setModel: (model) => set({ model }),

  addToolCall: (toolCall) =>
    set((state) => {
      const exists = state.toolCalls.some((call) => call.id === toolCall.id)
      if (exists) {
        return {
          toolCalls: state.toolCalls.map((call) => (call.id === toolCall.id ? { ...call, ...toolCall } : call)),
        }
      }
      return { toolCalls: [...state.toolCalls, toolCall] }
    }),

  updateToolCall: (id, updates) =>
    set((state) => ({
      toolCalls: state.toolCalls.map((toolCall) => (toolCall.id === id ? { ...toolCall, ...updates } : toolCall)),
    })),

  clearToolCalls: () => set({ toolCalls: [] }),

  reset: () =>
    set({
      sessions: [],
      activeSessionId: null,
      messages: [],
      streamingText: '',
      isStreaming: false,
      toolCalls: [],
      creditsExhausted: false,
      activeStreamId: null,
      streamingSessionId: null,
      finalizedStreamIds: new Set(),
      streamError: null,
    }),
}))
