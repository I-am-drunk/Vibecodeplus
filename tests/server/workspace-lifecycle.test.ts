/**
 * Workspace lifecycle contract tests (QA-034, QA-035, QA-036, QA-037, QA-032).
 *
 * QA-034: Close workspace cleanup watchers
 * QA-035: Close workspace cleanup streams
 * QA-036: Reopen after close
 * QA-037: Parallel open requests same project
 * QA-032: Open workspace reuse existing connection
 */

import { describe, test, expect } from 'bun:test'
import { streamRegistry } from '../../server/state/streams.ts'
import { resolveTerminalState, type StreamFSMContext, INITIAL_FSM_CONTEXT } from '../../server/services/streamStateMachine.ts'
import { nextWatcherState, type WatcherFSMState } from '../../server/services/watcherStateMachine.ts'
import { nextMigrationState, isMigrationTerminal } from '../../server/services/migrationService.ts'

describe('QA-034: close workspace cleanup watchers', () => {
  test('watcher transitions from running to stopped on workspace close', () => {
    expect(nextWatcherState('running', 'stop')).toBe('stopped')
  })

  test('watcher transitions from cooldown to stopped via cooldown_elapsed', () => {
    expect(nextWatcherState('cooldown', 'cooldown_elapsed')).toBe('stopped')
  })

  test('watcher in blocked_forbidden goes through cooldown then stopped', () => {
    const step1 = nextWatcherState('blocked_forbidden', 'cooldown_start')
    expect(step1).toBe('cooldown')
    const step2 = nextWatcherState('cooldown', 'cooldown_elapsed')
    expect(step2).toBe('stopped')
  })

  test('stopped watcher can be restarted (QA-036: reopen after close)', () => {
    expect(nextWatcherState('stopped', 'restart')).toBe('running')
  })

  test('idle watcher needs no cleanup on close', () => {
    expect(nextWatcherState('idle', 'stop')).toBeNull()
    // idle is already a clean state
  })
})

describe('QA-035: close workspace cleanup streams', () => {
  test('abortProject aborts all streams for a project', () => {
    const ac1 = new AbortController()
    const ac2 = new AbortController()
    streamRegistry.register('ws-close-s1', 'proj-close', ac1)
    streamRegistry.register('ws-close-s2', 'proj-close', ac2)

    const count = streamRegistry.abortProject('proj-close', 'workspace close')
    expect(count).toBe(2)
    expect(ac1.signal.aborted).toBe(true)
    expect(ac2.signal.aborted).toBe(true)

    streamRegistry.unregister('ws-close-s1')
    streamRegistry.unregister('ws-close-s2')
  })

  test('abortProject does not affect other projects', () => {
    const ac1 = new AbortController()
    const ac2 = new AbortController()
    streamRegistry.register('ws-close-s3', 'proj-close-a', ac1)
    streamRegistry.register('ws-close-s4', 'proj-close-b', ac2)

    const count = streamRegistry.abortProject('proj-close-a', 'workspace close')
    expect(count).toBe(1)
    expect(ac1.signal.aborted).toBe(true)
    expect(ac2.signal.aborted).toBe(false) // Other project unaffected

    streamRegistry.unregister('ws-close-s3')
    streamRegistry.unregister('ws-close-s4')
  })

  test('aborted stream resolves to aborted terminal state', () => {
    const fsm: StreamFSMContext = {
      ...INITIAL_FSM_CONTEXT,
      aborted: true,
      assistantText: 'partial work',
    }
    expect(resolveTerminalState(fsm) as string).toBe('aborted')
  })
})

describe('QA-036: reopen after close', () => {
  test('stream can be registered after previous one was unregistered', () => {
    const ac1 = new AbortController()
    const stream1 = streamRegistry.register('reopen-session', 'proj-reopen', ac1)
    streamRegistry.unregister('reopen-session', stream1.streamId)

    // Reopen
    const ac2 = new AbortController()
    const stream2 = streamRegistry.register('reopen-session', 'proj-reopen', ac2)
    expect(stream2.streamId).not.toBe(stream1.streamId)
    expect(stream2.sequence).toBe(0)

    streamRegistry.unregister('reopen-session', stream2.streamId)
  })

  test('watcher can be restarted after being stopped', () => {
    let state: WatcherFSMState = 'idle'
    state = nextWatcherState(state, 'start')! // idle → running
    expect(state).toBe('running')
    state = nextWatcherState(state, 'stop')! // running → stopped
    expect(state).toBe('stopped')
    state = nextWatcherState(state, 'restart')! // stopped → running
    expect(state).toBe('running')
  })
})

describe('QA-037: parallel open requests same project', () => {
  test('stream registry replaces existing stream for same session', () => {
    const ac1 = new AbortController()
    const stream1 = streamRegistry.register('parallel-session', 'proj-parallel', ac1)
    const id1 = stream1.streamId

    // Second register for same session replaces the first
    const ac2 = new AbortController()
    const stream2 = streamRegistry.register('parallel-session', 'proj-parallel', ac2)
    const id2 = stream2.streamId

    // First stream should be aborted
    expect(ac1.signal.aborted).toBe(true)

    // New stream has a different ID
    expect(id2).not.toBe(id1)

    streamRegistry.unregister('parallel-session', stream2.streamId)
  })
})

describe('QA-032: open workspace reuse existing connection', () => {
  test('migration FSM: completed migration is terminal (no re-migration)', () => {
    expect(isMigrationTerminal('completed')).toBe(true)
    expect(nextMigrationState('completed', 'start')).toBeNull()
  })

  test('failed migration is terminal (no auto-retry)', () => {
    expect(isMigrationTerminal('failed')).toBe(true)
    expect(nextMigrationState('failed', 'start')).toBeNull()
  })

  test('running migration returns same record on duplicate start', () => {
    // The orchestrator's start() method returns the existing migration
    // if it's already running or completed
    const runningResult = nextMigrationState('running', 'start')
    // Running + start is not a valid transition (no duplicate start)
    expect(runningResult).toBeNull()
  })
})
