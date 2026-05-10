/**
 * WS event contract validators (CP-04, CP-08).
 *
 * Defines the shape of every event type broadcast through the WebSocket hub
 * and provides parse functions that validate inbound/outbound payloads
 * against the expected schema.
 *
 * This is the single source of truth for the client to build its event map.
 */

// ── Broadcast event type literals ─────────────────────────────────────

export const WS_CONNECTED = 'ws:connected'
export const FILE_CHANGED = 'file:changed'
export const CHAT_STREAM_START = 'chat:stream:start'
export const CHAT_EVENT = 'chat:event'
export const CHAT_STREAM_END = 'chat:stream:end'
export const CREDITS_LOW = 'credits:low'
export const CREDITS_EXHAUSTED = 'credits:exhausted'
export const TERMINAL_ERROR_EVENT = 'terminal:error'

export type WSBroadcastEventType =
  | typeof WS_CONNECTED
  | typeof FILE_CHANGED
  | typeof CHAT_STREAM_START
  | typeof CHAT_EVENT
  | typeof CHAT_STREAM_END
  | typeof CREDITS_LOW
  | typeof CREDITS_EXHAUSTED
  | typeof TERMINAL_ERROR_EVENT

// ── Inbound WS message type literals ──────────────────────────────────

export const WS_SUBSCRIBE = 'subscribe'
export const WS_UNSUBSCRIBE = 'unsubscribe'
export const WS_PING = 'ping'
export const TERMINAL_RESIZE = 'terminal:resize'
export const TERMINAL_INPUT = 'terminal:input'

export type WSInboundEventType =
  | typeof WS_SUBSCRIBE
  | typeof WS_UNSUBSCRIBE
  | typeof WS_PING
  | typeof TERMINAL_RESIZE
  | typeof TERMINAL_INPUT

// ── Typed event shapes ────────────────────────────────────────────────

export type WSConnectedEvent = {
  type: typeof WS_CONNECTED
}

export type FileChangedEvent = {
  type: typeof FILE_CHANGED
  changes: Array<{ path: string; kind: string }>
}

export type ChatStreamStartEvent = {
  type: typeof CHAT_STREAM_START
  sessionId: string
  streamId: string
  requestId: string
  sequence: number
}

export type ChatEventEvent = {
  type: typeof CHAT_EVENT
  sessionId: string
  streamId: string
  requestId: string
  sequence: number
  event: unknown
}

export type ChatStreamEndEvent = {
  type: typeof CHAT_STREAM_END
  sessionId: string
  streamId: string
  requestId: string
  sequence: number
  terminal: string
  cutOff: boolean
  empty: boolean
  creditsExhausted?: boolean
  errorMessage?: string | null
}

export type CreditsLowEvent = {
  type: typeof CREDITS_LOW
  sequence: number
  streamId: string
  requestId: string
  balance: number
}

export type CreditsExhaustedEvent = {
  type: typeof CREDITS_EXHAUSTED
  sequence: number
  streamId: string
  requestId: string
  sessionId: string
}

export type TerminalErrorEvent = {
  type: typeof TERMINAL_ERROR_EVENT
  message: string
}

/** Union of all broadcast event types */
export type WSBroadcastEvent =
  | WSConnectedEvent
  | FileChangedEvent
  | ChatStreamStartEvent
  | ChatEventEvent
  | ChatStreamEndEvent
  | CreditsLowEvent
  | CreditsExhaustedEvent
  | TerminalErrorEvent

// ── Terminal status values ────────────────────────────────────────────

export const TERMINAL_COMPLETE = 'complete'
export const TERMINAL_CUT_OFF = 'cut_off'
export const TERMINAL_EMPTY = 'empty'
export const STREAM_ERROR = 'error'
export const TERMINAL_ABORTED = 'aborted'

export type StreamTerminalStatus =
  | typeof TERMINAL_COMPLETE
  | typeof TERMINAL_CUT_OFF
  | typeof TERMINAL_EMPTY
  | typeof STREAM_ERROR
  | typeof TERMINAL_ABORTED

const VALID_TERMINAL_STATUSES = new Set<string>([
  TERMINAL_COMPLETE,
  TERMINAL_CUT_OFF,
  TERMINAL_EMPTY,
  STREAM_ERROR,
  TERMINAL_ABORTED,
])

export function isValidTerminalStatus(value: string): value is StreamTerminalStatus {
  return VALID_TERMINAL_STATUSES.has(value)
}

// ── Parse helpers ─────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(record: Record<string, unknown>, field: string): string | undefined {
  const v = record[field]
  return typeof v === 'string' ? v : undefined
}

function readNumber(record: Record<string, unknown>, field: string): number | undefined {
  const v = record[field]
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

function readBool(record: Record<string, unknown>, field: string): boolean | undefined {
  const v = record[field]
  return typeof v === 'boolean' ? v : undefined
}

/**
 * Parse an inbound WS message from the client.
 * Returns a typed object or null if the message is unrecognized.
 */
export type InboundMessage =
  | { type: typeof WS_SUBSCRIBE; channels: string[] }
  | { type: typeof WS_UNSUBSCRIBE; channels: string[] }
  | { type: typeof WS_PING }
  | { type: typeof TERMINAL_RESIZE; rows: number; cols: number }
  | { type: typeof TERMINAL_INPUT; data: string }

export function parseInboundWSMessage(raw: unknown): InboundMessage | null {
  if (!isRecord(raw)) return null
  const type = readString(raw, 'type')

  if (type === WS_SUBSCRIBE || type === WS_UNSUBSCRIBE) {
    const channels = Array.isArray(raw.channels)
      ? (raw.channels as unknown[]).filter((c): c is string => typeof c === 'string')
      : []
    return { type, channels }
  }

  if (type === WS_PING) {
    return { type }
  }

  if (type === TERMINAL_RESIZE) {
    const rows = readNumber(raw, 'rows')
    const cols = readNumber(raw, 'cols')
    if (rows && cols) return { type, rows, cols }
    return null
  }

  if (type === TERMINAL_INPUT) {
    const data = readString(raw, 'data')
    if (data !== undefined) return { type, data }
    return null
  }

  return null
}

/**
 * Validate a broadcast event shape before it's sent to clients.
 * Returns the event if valid, or null if it's missing required fields.
 * This is a safety net — the broadcaster should already have the right shape.
 */
export function validateBroadcastEvent(raw: Record<string, unknown>): WSBroadcastEvent | null {
  const type = readString(raw, 'type')
  if (!type) return null

  switch (type) {
    case WS_CONNECTED:
      return { type }

    case FILE_CHANGED:
      return {
        type,
        changes: Array.isArray(raw.changes) ? raw.changes as any[] : [],
      }

    case CHAT_STREAM_START: {
      const sessionId = readString(raw, 'sessionId')
      const streamId = readString(raw, 'streamId')
      const requestId = readString(raw, 'requestId') ?? ''
      const sequence = readNumber(raw, 'sequence')
      if (!sessionId || !streamId || sequence === undefined) return null
      return { type, sessionId, streamId, requestId, sequence }
    }

    case CHAT_EVENT: {
      const sessionId = readString(raw, 'sessionId')
      const streamId = readString(raw, 'streamId')
      const requestId = readString(raw, 'requestId') ?? ''
      const sequence = readNumber(raw, 'sequence')
      if (!sessionId || !streamId || sequence === undefined) return null
      return { type, sessionId, streamId, requestId, sequence, event: raw.event }
    }

    case CHAT_STREAM_END: {
      const sessionId = readString(raw, 'sessionId')
      const streamId = readString(raw, 'streamId')
      const requestId = readString(raw, 'requestId') ?? ''
      const sequence = readNumber(raw, 'sequence')
      const terminal = readString(raw, 'terminal')
      if (!sessionId || !streamId || sequence === undefined || !terminal) return null
      if (!isValidTerminalStatus(terminal)) return null
      return {
        type,
        sessionId,
        streamId,
        requestId,
        sequence,
        terminal,
        cutOff: readBool(raw, 'cutOff') ?? false,
        empty: readBool(raw, 'empty') ?? false,
        creditsExhausted: readBool(raw, 'creditsExhausted'),
        errorMessage: readString(raw, 'errorMessage'),
      }
    }

    case CREDITS_LOW: {
      const sequence = readNumber(raw, 'sequence')
      const streamId = readString(raw, 'streamId')
      const requestId = readString(raw, 'requestId') ?? ''
      const balance = readNumber(raw, 'balance')
      if (sequence === undefined || !streamId || balance === undefined) return null
      return { type, sequence, streamId, requestId, balance }
    }

    case CREDITS_EXHAUSTED: {
      const sequence = readNumber(raw, 'sequence')
      const streamId = readString(raw, 'streamId')
      const requestId = readString(raw, 'requestId') ?? ''
      const sessionId = readString(raw, 'sessionId')
      if (sequence === undefined || !streamId || !sessionId) return null
      return { type, sequence, streamId, requestId, sessionId }
    }

    case TERMINAL_ERROR_EVENT: {
      const message = readString(raw, 'message')
      if (!message) return null
      return { type, message }
    }

    default:
      return null
  }
}
