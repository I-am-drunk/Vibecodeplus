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
  appendingToId: string | null

  setSessions: (sessions: ChatSession[]) => void
  setActiveSession: (id: string | null) => void
  setMessages: (messages: Message[]) => void
  addMessage: (msg: Message) => void
  beginStream: (params: { sessionId: string; streamId: string; appendMessageId?: string }) => void
  appendStreamText: (text: string) => void
  finalizeStream: (params: StreamFinalizeParams) => void
  setStreaming: (value: boolean) => void
  setCreditsExhausted: (value: boolean) => void
  setModel: (model: string) => void
  addToolCall: (toolCall: ToolCall) => void
  updateToolCall: (id: string, updates: Partial<ToolCall>) => void
  clearToolCalls: () => void
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
  toolCalls: [],
  activeStreamId: null,
  streamingSessionId: null,
  finalizedStreamIds: new Set(),
  appendingToId: null,

  setSessions: (sessions) => set({ sessions }),

  setActiveSession: (id) => {
    set({ activeSessionId: id })
  },

  setMessages: (messages) => set({ messages }),

  addMessage: (msg) => set((state) => {
    if (state.messages.some(m => m.id === msg.id)) return state
    return { messages: [...state.messages, msg] }
  }),

  beginStream: ({ sessionId, streamId, appendMessageId }) =>
    set(() => ({
      streamingSessionId: sessionId,
      activeStreamId: streamId,
      isStreaming: true,
      streamingText: '',
      toolCalls: [],
      appendingToId: appendMessageId || null,
    })),

  appendStreamText: (text) => set((state) => ({ streamingText: state.streamingText + text })),

  finalizeStream: ({ content, terminal, streamId, sessionId }) =>
    set((state) => {
      if (streamId && state.finalizedStreamIds.has(streamId)) {
        return {
          isStreaming: false,
          streamingText: '',
          activeStreamId: null,
          streamingSessionId: null,
        }
      }

      const hasContent = Boolean(content)
      const hasUnassignedToolCalls = state.toolCalls.some((toolCall) => !toolCall.messageId)
      const shouldPersistMessage = hasContent || hasUnassignedToolCalls || terminal !== 'empty' || state.appendingToId

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
          appendingToId: null,
          finalizedStreamIds: nextFinalized,
        }
      }

      if (state.appendingToId) {
        return {
          streamingText: '',
          isStreaming: false,
          activeStreamId: null,
          streamingSessionId: null,
          appendingToId: null,
          finalizedStreamIds: nextFinalized,
          messages: state.messages.map(m => {
            if (m.id === state.appendingToId) {
              return {
                ...m,
                content: m.content + content,
                cutOff: terminal !== 'complete',
                terminalStatus: terminal,
              }
            }
            return m
          }),
          activeSessionId: sessionId ?? state.activeSessionId,
          toolCalls: state.toolCalls.map((toolCall) =>
            toolCall.messageId ? toolCall : { ...toolCall, messageId: state.appendingToId ?? undefined },
          ),
        }
      }

      const messageId = crypto.randomUUID()
      const assistantMessage: Message = {
        id: messageId,
        role: 'assistant',
        content: content || '',
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
        toolCalls: state.toolCalls.map((toolCall) =>
          toolCall.messageId ? toolCall : { ...toolCall, messageId },
        ),
      }
    }),

  setStreaming: (value) =>
    set((state) => ({
      isStreaming: value,
      streamingText: value ? state.streamingText : '',
      activeStreamId: value ? state.activeStreamId : null,
      streamingSessionId: value ? state.streamingSessionId : null,
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
      appendingToId: null,
    }),
}))
