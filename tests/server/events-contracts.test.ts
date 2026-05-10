import { describe, test, expect } from 'bun:test'
import {
  parseInboundWSMessage,
  validateBroadcastEvent,
  isValidTerminalStatus,
  WS_CONNECTED,
  FILE_CHANGED,
  CHAT_STREAM_START,
  CHAT_EVENT,
  CHAT_STREAM_END,
  CREDITS_LOW,
  CREDITS_EXHAUSTED,
  TERMINAL_ERROR_EVENT,
  TERMINAL_COMPLETE,
  TERMINAL_CUT_OFF,
  TERMINAL_EMPTY,
  STREAM_ERROR,
  TERMINAL_ABORTED,
} from '../../server/contracts/events.ts'

describe('WS event contracts', () => {
  // ── Inbound message parsing ──────────────────────────────────────────

  describe('parseInboundWSMessage', () => {
    test('parses subscribe message', () => {
      const msg = parseInboundWSMessage({ type: 'subscribe', channels: ['project:abc'] })
      expect(msg).toEqual({ type: 'subscribe', channels: ['project:abc'] })
    })

    test('parses unsubscribe message', () => {
      const msg = parseInboundWSMessage({ type: 'unsubscribe', channels: ['project:abc'] })
      expect(msg).toEqual({ type: 'unsubscribe', channels: ['project:abc'] })
    })

    test('parses ping message', () => {
      const msg = parseInboundWSMessage({ type: 'ping' })
      expect(msg).toEqual({ type: 'ping' })
    })

    test('parses terminal:resize message', () => {
      const msg = parseInboundWSMessage({ type: 'terminal:resize', rows: 40, cols: 120 })
      expect(msg).toEqual({ type: 'terminal:resize', rows: 40, cols: 120 })
    })

    test('parses terminal:input message', () => {
      const msg = parseInboundWSMessage({ type: 'terminal:input', data: 'ls -la\n' })
      expect(msg).toEqual({ type: 'terminal:input', data: 'ls -la\n' })
    })

    test('returns null for unknown type', () => {
      expect(parseInboundWSMessage({ type: 'unknown' })).toBeNull()
    })

    test('returns null for non-object input', () => {
      expect(parseInboundWSMessage('hello')).toBeNull()
      expect(parseInboundWSMessage(42)).toBeNull()
      expect(parseInboundWSMessage(null)).toBeNull()
      expect(parseInboundWSMessage(undefined)).toBeNull()
    })

    test('returns null for missing type', () => {
      expect(parseInboundWSMessage({ channels: ['project:abc'] })).toBeNull()
    })

    test('filters non-string channels in subscribe', () => {
      const msg = parseInboundWSMessage({ type: 'subscribe', channels: ['valid', 123, null, 'also-valid'] })
      expect(msg).toEqual({ type: 'subscribe', channels: ['valid', 'also-valid'] })
    })

    test('returns null for terminal:resize with missing rows/cols', () => {
      expect(parseInboundWSMessage({ type: 'terminal:resize', rows: 40 })).toBeNull()
      expect(parseInboundWSMessage({ type: 'terminal:resize', cols: 120 })).toBeNull()
    })

    test('returns null for terminal:input with missing data', () => {
      expect(parseInboundWSMessage({ type: 'terminal:input' })).toBeNull()
    })
  })

  // ── Broadcast event validation ──────────────────────────────────────

  describe('validateBroadcastEvent', () => {
    test('validates ws:connected', () => {
      expect(validateBroadcastEvent({ type: WS_CONNECTED })).toEqual({ type: WS_CONNECTED })
    })

    test('validates file:changed', () => {
      const result = validateBroadcastEvent({ type: FILE_CHANGED, changes: [{ path: '/foo', kind: 'modify' }] })
      expect(result).not.toBeNull()
      expect(result!.type).toBe(FILE_CHANGED)
    })

    test('validates chat:stream:start', () => {
      const result = validateBroadcastEvent({
        type: CHAT_STREAM_START,
        sessionId: 's1',
        streamId: 'st1',
        requestId: 'r1',
        sequence: 1,
      })
      expect(result).toEqual({
        type: CHAT_STREAM_START,
        sessionId: 's1',
        streamId: 'st1',
        requestId: 'r1',
        sequence: 1,
      })
    })

    test('validates chat:stream:end', () => {
      const result = validateBroadcastEvent({
        type: CHAT_STREAM_END,
        sessionId: 's1',
        streamId: 'st1',
        requestId: 'r1',
        sequence: 5,
        terminal: TERMINAL_COMPLETE,
        cutOff: false,
        empty: false,
      })
      expect(result).not.toBeNull()
      expect(result!.type).toBe(CHAT_STREAM_END)
      expect((result as any).terminal).toBe(TERMINAL_COMPLETE)
    })

    test('rejects chat:stream:end with invalid terminal status', () => {
      const result = validateBroadcastEvent({
        type: CHAT_STREAM_END,
        sessionId: 's1',
        streamId: 'st1',
        requestId: 'r1',
        sequence: 5,
        terminal: 'invalid_status',
        cutOff: false,
        empty: false,
      })
      expect(result).toBeNull()
    })

    test('validates credits:low', () => {
      const result = validateBroadcastEvent({
        type: CREDITS_LOW,
        sequence: 3,
        streamId: 'st1',
        requestId: 'r1',
        balance: 50,
      })
      expect(result).not.toBeNull()
      expect((result as any).balance).toBe(50)
    })

    test('validates credits:exhausted', () => {
      const result = validateBroadcastEvent({
        type: CREDITS_EXHAUSTED,
        sequence: 4,
        streamId: 'st1',
        requestId: 'r1',
        sessionId: 's1',
      })
      expect(result).not.toBeNull()
    })

    test('validates terminal:error', () => {
      const result = validateBroadcastEvent({
        type: TERMINAL_ERROR_EVENT,
        message: 'Connection failed',
      })
      expect(result).toEqual({ type: TERMINAL_ERROR_EVENT, message: 'Connection failed' })
    })

    test('returns null for missing type', () => {
      expect(validateBroadcastEvent({})).toBeNull()
    })

    test('returns null for unknown type', () => {
      expect(validateBroadcastEvent({ type: 'unknown:event' })).toBeNull()
    })

    test('returns null for chat:stream:start missing required fields', () => {
      expect(validateBroadcastEvent({ type: CHAT_STREAM_START, sessionId: 's1' })).toBeNull()
      expect(validateBroadcastEvent({ type: CHAT_STREAM_START, sessionId: 's1', streamId: 'st1' })).toBeNull()
    })

    test('defaults requestId to empty string when missing', () => {
      const result = validateBroadcastEvent({
        type: CHAT_STREAM_START,
        sessionId: 's1',
        streamId: 'st1',
        sequence: 1,
      })
      expect(result).not.toBeNull()
      expect((result as any).requestId).toBe('')
    })
  })

  // ── Terminal status validation ───────────────────────────────────────

  describe('isValidTerminalStatus', () => {
    test('accepts valid terminal statuses', () => {
      expect(isValidTerminalStatus(TERMINAL_COMPLETE)).toBe(true)
      expect(isValidTerminalStatus(TERMINAL_CUT_OFF)).toBe(true)
      expect(isValidTerminalStatus(TERMINAL_EMPTY)).toBe(true)
      expect(isValidTerminalStatus(STREAM_ERROR)).toBe(true)
      expect(isValidTerminalStatus(TERMINAL_ABORTED)).toBe(true)
    })

    test('rejects invalid terminal statuses', () => {
      expect(isValidTerminalStatus('done')).toBe(false)
      expect(isValidTerminalStatus('failed')).toBe(false)
      expect(isValidTerminalStatus('')).toBe(false)
      expect(isValidTerminalStatus('COMPLETE')).toBe(false)
    })
  })
})
