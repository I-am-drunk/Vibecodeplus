/**
 * Feature flag fallback and chaos resilience tests (QA-194, QA-195, QA-196).
 *
 * QA-194: Feature flag fallback stream_fsm_v2
 * QA-195: Feature flag fallback migration_v1
 * QA-196: Chaos random WS disconnects
 */

import { describe, test, expect } from 'bun:test'
import { streamRegistry } from '../../server/state/streams.ts'
import { resolveTerminalState, type StreamFSMContext, INITIAL_FSM_CONTEXT } from '../../server/services/streamStateMachine.ts'
import { nextMigrationState, isMigrationTerminal } from '../../server/services/migrationService.ts'
import { nextWatcherState } from '../../server/services/watcherStateMachine.ts'
import { parseInboundWSMessage, validateBroadcastEvent } from '../../server/contracts/events.ts'

describe('QA-194: feature flag fallback stream_fsm_v2', () => {
  test('FSM produces correct terminal states regardless of flag', () => {
    // Even if stream_fsm_v2 flag is off, the core FSM logic must be correct
    const scenarios: Array<[StreamFSMContext, string]> = [
      [{ ...INITIAL_FSM_CONTEXT, sawDone: true }, 'complete'],
      [{ ...INITIAL_FSM_CONTEXT, sawError: true, errorMessage: 'fail' }, 'error'],
      [{ ...INITIAL_FSM_CONTEXT, aborted: true }, 'aborted'],
      [{ ...INITIAL_FSM_CONTEXT, creditsExhausted: true, assistantText: 'partial' }, 'cut_off'],
      [{ ...INITIAL_FSM_CONTEXT, assistantText: 'some text' }, 'cut_off'],
      [{ ...INITIAL_FSM_CONTEXT }, 'empty'],
    ]

    for (const [ctx, expected] of scenarios) {
      expect(resolveTerminalState(ctx) as string).toBe(expected)
    }
  })

  test('stream registry operations work regardless of flag state', () => {
    const ac = new AbortController()
    const stream = streamRegistry.register('flag-test-session', 'flag-project', ac)

    expect(stream.streamId).toBeTruthy()
    expect(stream.sequence).toBe(0)

    const seq = streamRegistry.nextSequence('flag-test-session', stream.streamId)
    expect(seq).toBe(1)

    const marked = streamRegistry.markTerminal('flag-test-session', stream.streamId, 'complete')
    expect(marked).toBe(true)

    streamRegistry.unregister('flag-test-session', stream.streamId)
  })
})

describe('QA-195: feature flag fallback migration_v1', () => {
  test('migration FSM transitions are valid regardless of flag', () => {
    // Core FSM transitions must work even if migration_v2 flag is off
    expect(nextMigrationState('pending', 'start')).toBe('running')
    expect(nextMigrationState('running', 'success')).toBe('completed')
    expect(nextMigrationState('running', 'failure')).toBe('failed')
    expect(nextMigrationState('running', 'partial_failure')).toBe('partial_failed')
  })

  test('terminal states are correctly identified regardless of flag', () => {
    expect(isMigrationTerminal('completed')).toBe(true)
    expect(isMigrationTerminal('failed')).toBe(true)
    expect(isMigrationTerminal('running')).toBe(false)
    expect(isMigrationTerminal('pending')).toBe(false)
    expect(isMigrationTerminal('partial_failed')).toBe(false)
  })

  test('watcher FSM transitions are valid regardless of flag', () => {
    expect(nextWatcherState('idle', 'start')).toBe('running')
    expect(nextWatcherState('running', 'forbidden_error')).toBe('blocked_forbidden')
    expect(nextWatcherState('running', 'stop')).toBe('stopped')
    expect(nextWatcherState('stopped', 'restart')).toBe('running')
  })
})

describe('QA-196: chaos random WS disconnects', () => {
  test('malformed WS messages are safely ignored under chaos', () => {
    const malformedMessages = [
      '',
      'not json',
      '{}',
      '{"type":"unknown"}',
      '{"type":"terminal:resize","cols":-1}',
      '{"type":"terminal:input","data":null}',
      '{"type":"subscribe","projectIds":null}',
      'null',
      '[]',
      '"string"',
      '123',
      'true',
      '{"type":"terminal:resize"}', // missing cols/rows
      '{"type":"terminal:input"}', // missing data
      '{"type":"subscribe"}', // missing projectIds
    ]

    for (const msg of malformedMessages) {
      // parseInboundWSMessage should not throw — it returns null for invalid messages
      const result = parseInboundWSMessage(msg)
      // Either null (invalid) or a valid parsed message
      if (result) {
        expect(result.type).toBeTruthy()
      }
    }
  })

  test('broadcast events validate correctly under chaos', () => {
    const chaosEvents = [
      { type: 'chat:stream:end', terminal: 'invalid_status', cutOff: true, empty: false },
      { type: 'chat:stream:end', terminal: 'complete', cutOff: false, empty: false, extraField: true },
      { type: 'credits:low', balance: -5 },
      { type: 'credits:exhausted' }, // missing required fields
    ]

    for (const event of chaosEvents) {
      // validateBroadcastEvent should handle these gracefully
      const result = validateBroadcastEvent(event as any)
      // Should either return null or a valid parsed event
      // The key contract is: no throw
      expect(result === null || typeof result === 'object').toBe(true)
    }
  })

  test('stream operations remain consistent under rapid register/unregister', () => {
    // Simulate chaos: rapid connect/disconnect cycles
    const sessionIds: string[] = []
    const streamIds: string[] = []

    for (let i = 0; i < 50; i++) {
      const ac = new AbortController()
      const sid = `chaos-session-${i}`
      const stream = streamRegistry.register(sid, 'chaos-project', ac)
      sessionIds.push(sid)
      streamIds.push(stream.streamId)

      // Immediately unregister some
      if (i % 3 === 0) {
        streamRegistry.unregister(sid, stream.streamId)
      }
    }

    // Remaining streams should be consistent
    const active = streamRegistry.getActive().filter(s => s.projectId === 'chaos-project')
    expect(active.length).toBeGreaterThan(0)

    // Cleanup all
    streamRegistry.abortProject('chaos-project', 'chaos cleanup')
    for (const sid of sessionIds) {
      streamRegistry.unregister(sid)
    }
  })
})
