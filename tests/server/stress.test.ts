/**
 * Stress test (QA-198).
 *
 * Simulates high-volume sequential operations to verify:
 * - No memory leak in stream registry
 * - No state corruption under rapid register/unregister cycles
 * - Sequence numbering remains monotonic under stress
 * - Terminal state marking remains correct under stress
 * - Migration FSM handles rapid state transitions
 */

import { describe, test, expect } from 'bun:test'
import { streamRegistry, type StreamTerminalState } from '../../server/state/streams.ts'
import {
  resolveTerminalState,
  INITIAL_FSM_CONTEXT,
  type StreamFSMContext,
} from '../../server/services/streamStateMachine.ts'
import {
  nextMigrationState,
  isMigrationTerminal,
} from '../../server/services/migrationService.ts'

describe('stress: stream registry', () => {
  test('1000 sequential register/unregister cycles with no leak', () => {
    const sessionId = 'stress-session'
    const projectId = 'stress-project'

    for (let i = 0; i < 1000; i++) {
      const ac = new AbortController()
      const stream = streamRegistry.register(`${sessionId}-${i}`, projectId, ac)
      streamRegistry.unregister(`${sessionId}-${i}`, stream.streamId)
    }

    // All streams should be gone
    expect(streamRegistry.getActive().length).toBe(0)
  })

  test('sequence numbering remains monotonic under stress', () => {
    const sessionId = 'stress-seq-session'
    const projectId = 'stress-seq-project'
    const ac = new AbortController()
    const stream = streamRegistry.register(sessionId, projectId, ac)

    let lastSeq = 0
    for (let i = 0; i < 1000; i++) {
      const seq = streamRegistry.nextSequence(sessionId, stream.streamId)
      expect(seq).not.toBeNull()
      expect(seq!).toBeGreaterThan(lastSeq)
      lastSeq = seq!
    }

    expect(lastSeq).toBe(1000)
    streamRegistry.unregister(sessionId, stream.streamId)
  })

  test('terminal state marking under rapid cycles', () => {
    const terminalStates: StreamTerminalState[] = ['complete', 'cut_off', 'empty', 'error', 'aborted']

    for (let i = 0; i < 100; i++) {
      const sessionId = `stress-terminal-${i}`
      const projectId = 'stress-terminal-project'
      const ac = new AbortController()
      const stream = streamRegistry.register(sessionId, projectId, ac)

      const terminal = terminalStates[i % terminalStates.length]
      const accepted = streamRegistry.markTerminal(sessionId, stream.streamId, terminal)
      expect(accepted).toBe(true)

      // Second mark should be rejected (exactly-once)
      const accepted2 = streamRegistry.markTerminal(sessionId, stream.streamId, 'complete')
      expect(accepted2).toBe(false)

      streamRegistry.unregister(sessionId, stream.streamId)
    }

    expect(streamRegistry.getActive().length).toBe(0)
  })

  test('abort all under stress', () => {
    // Register 100 streams
    for (let i = 0; i < 100; i++) {
      const ac = new AbortController()
      streamRegistry.register(`stress-abort-${i}`, 'stress-abort-project', ac)
    }

    expect(streamRegistry.getActive().length).toBe(100)

    // Abort all
    streamRegistry.abortAll('stress test')

    // Streams still exist until unregistered, but should have abort reason
    const active = streamRegistry.getActive()
    for (const stream of active) {
      expect(stream.abortReason).toBe('stress test')
    }

    // Cleanup
    for (let i = 0; i < 100; i++) {
      streamRegistry.unregister(`stress-abort-${i}`)
    }

    expect(streamRegistry.getActive().length).toBe(0)
  })
})

describe('stress: stream FSM resolution', () => {
  test('1000 terminal state resolutions are consistent', () => {
    const states: StreamFSMContext[] = [
      { sawDone: true, sawError: false, creditsExhausted: false, aborted: false, assistantText: 'text', errorMessage: null },
      { sawDone: false, sawError: true, creditsExhausted: false, aborted: false, assistantText: '', errorMessage: 'err' },
      { sawDone: false, sawError: false, creditsExhausted: true, aborted: false, assistantText: '', errorMessage: null },
      { sawDone: false, sawError: false, creditsExhausted: false, aborted: true, assistantText: 'text', errorMessage: null },
      { sawDone: false, sawError: false, creditsExhausted: false, aborted: false, assistantText: '', errorMessage: null },
    ]

    const expected = ['complete', 'error', 'cut_off', 'aborted', 'empty']

    for (let i = 0; i < 1000; i++) {
      const idx = i % states.length
      const result = resolveTerminalState(states[idx])
      expect(result as string).toBe(expected[idx])
    }
  })
})

describe('stress: migration FSM', () => {
  test('1000 rapid state transitions', () => {
    for (let i = 0; i < 1000; i++) {
      const state = nextMigrationState('pending', 'start')
      expect(state).toBe('running')

      const outcome = i % 3
      if (outcome === 0) {
        expect(nextMigrationState('running', 'success')).toBe('completed')
        expect(isMigrationTerminal('completed')).toBe(true)
      } else if (outcome === 1) {
        expect(nextMigrationState('running', 'failure')).toBe('failed')
        expect(isMigrationTerminal('failed')).toBe(true)
      } else {
        expect(nextMigrationState('running', 'partial_failure')).toBe('partial_failed')
        expect(isMigrationTerminal('partial_failed')).toBe(false)
      }
    }
  })
})

describe('stress: dialog FSM', () => {
  test('1000 dialog lifecycle cycles', () => {
    const { nextDialogState, isDialogTerminal } = require('../../server/services/dialogStateMachine.ts')

    for (let i = 0; i < 1000; i++) {
      let state = 'closed'
      state = nextDialogState(state, 'open')!
      expect(state).toBe('opening')
      state = 'open' // skip to open for speed
      state = nextDialogState(state, 'submit')!
      expect(state).toBe('submitting')

      if (i % 2 === 0) {
        state = nextDialogState(state, 'success')!
        expect(state).toBe('success')
        expect(isDialogTerminal(state)).toBe(true)
      } else {
        state = nextDialogState(state, 'error')!
        expect(state).toBe('error')
        expect(isDialogTerminal(state)).toBe(true)
        state = nextDialogState(state, 'close')!
        expect(state).toBe('closed')
      }
    }
  })
})
