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

interface ChatState {
  sessions: ChatSession[]
  activeSessionId: string | null
  messages: Message[]
  streamingText: string
  isStreaming: boolean
  creditsExhausted: boolean
  model: string
  toolCalls: ToolCall[]

  setSessions: (sessions: ChatSession[]) => void
  setActiveSession: (id: string | null) => void
  setMessages: (messages: Message[]) => void
  addMessage: (msg: Message) => void
  appendStreamText: (text: string) => void
  finalizeStream: (content: string, cutOff?: boolean) => void
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

  appendStreamText: (text) => set((state) => ({ streamingText: state.streamingText + text })),

  finalizeStream: (content, cutOff) =>
    set((state) => {
      const hasContent = Boolean(content)
      const hasUnassignedToolCalls = state.toolCalls.some((toolCall) => !toolCall.messageId)

      if (!hasContent && !hasUnassignedToolCalls && !cutOff) {
        return {
          isStreaming: false,
          streamingText: '',
        }
      }

      const messageId = crypto.randomUUID()
      const assistantMessage: Message = {
        id: messageId,
        role: 'assistant',
        content: content || '',
        createdAt: new Date().toISOString(),
        cutOff: cutOff ?? false,
      }

      return {
        streamingText: '',
        isStreaming: false,
        messages: [...state.messages, assistantMessage],
        toolCalls: state.toolCalls.map((toolCall) =>
          toolCall.messageId ? toolCall : { ...toolCall, messageId },
        ),
      }
    }),

  setStreaming: (value) =>
    set((state) => ({
      isStreaming: value,
      streamingText: value ? state.streamingText : '',
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
      toolCalls: state.toolCalls.map((toolCall) =>
        toolCall.id === id ? { ...toolCall, ...updates } : toolCall,
      ),
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
    }),
}))
