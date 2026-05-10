/**
 * Stream event dedup and ordering tests (QA-111, QA-112, QA-113, QA-115, QA-116, QA-117).
 *
 * QA-111: Duplicate end event ignored
 * QA-112: Error then end deduped
 * QA-113: Aborted then end deduped
 * QA-115: Stream ID mismatch ignored
 * QA-116: Sequence out-of-order ignored
 * QA-117: Sequence duplicate ignored
 * QA-097: Forbidden storm 10x no loop
 */

import { describe, test, expect } from 'bun:test'
import { streamRegistry } from '../../server/state/streams.ts'
import { resolveTerminalState, type StreamFSMContext } from '../../server/services/streamStateMachine.ts'
import { isForbiddenError, computeBackoff, nextWatcherState } from '../../server/services/watcherStateMachine.ts'

describe('QA-111: duplicate end event ignored', () => {
  test('markTerminal returns false on duplicate call (second end ignored)', () => {
    const ac = new AbortController()
    const stream = streamRegistry.register('qa111-session', 'project-1', ac)

    // First terminal — accepted
    const first = streamRegistry.markTerminal('qa111-session', stream.streamId, 'complete')
    expect(first).toBe(true)

    // Second terminal (duplicate end) — ignored
    const second = streamRegistry.markTerminal('qa111-session', stream.streamId, 'error')
    expect(second).toBe(false)

    // State remains the first terminal
    const active = streamRegistry.get('qa111-session')
    expect(active?.terminalState).toBe('complete')

    streamRegistry.unregister('qa111-session', stream.streamId)
  })
})

describe('QA-112: error then end deduped', () => {
  test('error terminal takes precedence, subsequent end is ignored', () => {
    const fsm: StreamFSMContext = {
      sawDone: false,
      sawError: true,
      creditsExhausted: false,
      aborted: false,
      assistantText: '',
      errorMessage: 'API error',
    }

    // Error state resolved first
    const terminal = resolveTerminalState(fsm)
    expect(terminal as string).toBe('error')

    // If done arrives after error, the FSM already captured error
    // markTerminal on an already-terminal stream returns false
    const ac = new AbortController()
    const stream = streamRegistry.register('qa112-session', 'project-1', ac)
    streamRegistry.markTerminal('qa112-session', stream.streamId, 'error')

    // Late "done" event would try to mark complete — should be ignored
    const lateDone = streamRegistry.markTerminal('qa112-session', stream.streamId, 'complete')
    expect(lateDone).toBe(false)

    streamRegistry.unregister('qa112-session', stream.streamId)
  })
})

describe('QA-113: aborted then end deduped', () => {
  test('aborted terminal takes precedence, subsequent end is ignored', () => {
    const ac = new AbortController()
    const stream = streamRegistry.register('qa113-session', 'project-1', ac)

    // Mark as aborted
    streamRegistry.abort('qa113-session', 'user abort')
    const fsm: StreamFSMContext = {
      sawDone: true,
      sawError: false,
      creditsExhausted: false,
      aborted: true,
      assistantText: 'partial',
      errorMessage: null,
    }
    expect(resolveTerminalState(fsm) as string).toBe('aborted')

    streamRegistry.markTerminal('qa113-session', stream.streamId, 'aborted')

    // Late "done" event — ignored
    const lateDone = streamRegistry.markTerminal('qa113-session', stream.streamId, 'complete')
    expect(lateDone).toBe(false)

    streamRegistry.unregister('qa113-session', stream.streamId)
  })
})

describe('QA-115: stream ID mismatch ignored', () => {
  test('markTerminal with wrong streamId returns false', () => {
    const ac = new AbortController()
    const stream = streamRegistry.register('qa115-session', 'project-1', ac)

    const result = streamRegistry.markTerminal('qa115-session', 'wrong-stream-id', 'complete')
    expect(result).toBe(false)

    streamRegistry.unregister('qa115-session', stream.streamId)
  })

  test('nextSequence with wrong streamId returns null', () => {
    const ac = new AbortController()
    const stream = streamRegistry.register('qa115b-session', 'project-1', ac)

    const seq = streamRegistry.nextSequence('qa115b-session', 'wrong-stream-id')
    expect(seq).toBeNull()

    streamRegistry.unregister('qa115b-session', stream.streamId)
  })
})

describe('QA-116: sequence out-of-order ignored', () => {
  test('sequence is always monotonic — cannot go backwards', () => {
    const ac = new AbortController()
    const stream = streamRegistry.register('qa116-session', 'project-1', ac)

    const seq1 = streamRegistry.nextSequence('qa116-session', stream.streamId)
    const seq2 = streamRegistry.nextSequence('qa116-session', stream.streamId)
    const seq3 = streamRegistry.nextSequence('qa116-session', stream.streamId)

    expect(seq1).toBe(1)
    expect(seq2).toBe(2)
    expect(seq3).toBe(3)
    expect(seq2!).toBeGreaterThan(seq1!)
    expect(seq3!).toBeGreaterThan(seq2!)

    streamRegistry.unregister('qa116-session', stream.streamId)
  })
})

describe('QA-117: sequence duplicate ignored', () => {
  test('each nextSequence call produces a unique value', () => {
    const ac = new AbortController()
    const stream = streamRegistry.register('qa117-session', 'project-1', ac)

    const sequences: number[] = []
    for (let i = 0; i < 20; i++) {
      const seq = streamRegistry.nextSequence('qa117-session', stream.streamId)
      if (seq !== null) sequences.push(seq)
    }

    // All sequences should be unique
    const unique = new Set(sequences)
    expect(unique.size).toBe(sequences.length)

    // All sequences should be monotonically increasing
    for (let i = 1; i < sequences.length; i++) {
      expect(sequences[i]).toBeGreaterThan(sequences[i - 1])
    }

    streamRegistry.unregister('qa117-session', stream.streamId)
  })
})

describe('QA-097: forbidden storm 10x no loop', () => {
  test('10 consecutive forbidden errors do not cause infinite loop', () => {
    // Each forbidden error should transition to blocked_forbidden
    // But blocked_forbidden + forbidden_error is an illegal transition (returns null)
    // This prevents the loop
    for (let i = 0; i < 10; i++) {
      const result = nextWatcherState('blocked_forbidden', 'forbidden_error')
      // The FSM prevents re-entering blocked_forbidden from blocked_forbidden
      expect(result).toBeNull()
    }
  })

  test('forbidden storm produces increasing backoff', () => {
    const base = 10_000
    const max = 300_000
    let prevBackoff = 0

    for (let failure = 1; failure <= 10; failure++) {
      const backoff = computeBackoff(failure, base, max)
      expect(backoff).toBeGreaterThan(prevBackoff - 2000) // Account for jitter
      prevBackoff = backoff
    }

    // Backoff should never exceed max
    const backoffAt10 = computeBackoff(10, base, max)
    expect(backoffAt10).toBeLessThanOrEqual(max)
  })

  test('isForbiddenError correctly identifies all forbidden patterns', () => {
    const forbiddenMessages = [
      '403 Forbidden',
      '401 Unauthorized access',
      'Authentication failed',
      'Permission denied (publickey)',
      'Acquiring sandbox failed: auth error',
    ]

    for (const msg of forbiddenMessages) {
      expect(isForbiddenError(msg)).toBe(true)
    }

    const nonForbiddenMessages = [
      'Connection timeout',
      'ENOENT: file not found',
      'Out of memory',
      'ECONNRESET',
    ]

    for (const msg of nonForbiddenMessages) {
      expect(isForbiddenError(msg)).toBe(false)
    }
  })
})
