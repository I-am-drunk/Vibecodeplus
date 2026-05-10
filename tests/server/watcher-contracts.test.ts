/**
 * Watcher contract tests (CP-18, CP-19).
 *
 * CP-18: Forbidden loop breaker — repeated forbidden enters quarantine with exponential backoff
 * CP-19: Stale watcher remap — post-migration watcher ownership transferred
 */

import { describe, test, expect } from 'bun:test'
import { FileChangeWatcher, type WatcherStatus } from '../../server/ssh/watcher.ts'
import {
  nextWatcherState,
  isLegalWatcherTransition,
  computeBackoff,
  isForbiddenError,
  type WatcherFSMState,
} from '../../server/services/watcherStateMachine.ts'

describe('CP-18: forbidden loop breaker', () => {
  test('isForbiddenError detects forbidden messages', () => {
    expect(isForbiddenError('Forbidden: access denied')).toBe(true)
    expect(isForbiddenError('Unauthorized: invalid key')).toBe(true)
    expect(isForbiddenError('authentication failed')).toBe(true)
    expect(isForbiddenError('Permission denied (publickey)')).toBe(true)
    expect(isForbiddenError('Acquiring sandbox failed')).toBe(true)
  })

  test('isForbiddenError ignores non-forbidden messages', () => {
    expect(isForbiddenError('Connection timeout')).toBe(false)
    expect(isForbiddenError('Network error')).toBe(false)
    expect(isForbiddenError('ENOENT: no such file')).toBe(false)
  })

  test('computeBackoff increases with failure count', () => {
    const base = 10_000
    const max = 300_000
    const b1 = computeBackoff(1, base, max)
    const b2 = computeBackoff(2, base, max)
    const b3 = computeBackoff(3, base, max)

    expect(b2).toBeGreaterThan(b1)
    expect(b3).toBeGreaterThan(b2)
  })

  test('computeBackoff is capped at maximum', () => {
    const backoff = computeBackoff(100, 10_000, 300_000)
    expect(backoff).toBeLessThanOrEqual(300_000) // MAX_COOLDOWN_MS
  })

  test('nextWatcherState: running + forbidden_error → blocked_forbidden', () => {
    const next = nextWatcherState('running', 'forbidden_error')
    expect(next).toBe('blocked_forbidden')
  })

  test('nextWatcherState: blocked_forbidden + cooldown_start → cooldown', () => {
    const next = nextWatcherState('blocked_forbidden', 'cooldown_start')
    expect(next).toBe('cooldown')
  })

  test('nextWatcherState: blocked_forbidden + forbidden_error → null (loop breaker)', () => {
    const next = nextWatcherState('blocked_forbidden', 'forbidden_error')
    expect(next).toBeNull()
  })

  test('isLegalWatcherTransition enforces valid paths', () => {
    expect(isLegalWatcherTransition('idle', 'start')).toBe(true)
    expect(isLegalWatcherTransition('running', 'forbidden_error')).toBe(true)
    expect(isLegalWatcherTransition('blocked_forbidden', 'cooldown_start')).toBe(true)
    expect(isLegalWatcherTransition('stopped', 'restart')).toBe(true)
    expect(isLegalWatcherTransition('idle', 'forbidden_error')).toBe(false)
    expect(isLegalWatcherTransition('blocked_forbidden', 'start')).toBe(false)
  })
})

describe('CP-19: stale watcher remap', () => {
  test('remapProject stops source and starts target', () => {
    const watcher = new FileChangeWatcher()

    // Start source watcher
    watcher.start('source-project', 1000)
    const sourceState = watcher.getState('source-project')
    expect(sourceState.state).toBe('running')

    // Remap to target
    watcher.remapProject('source-project', 'target-project')

    // Source should be stopped
    const afterSourceState = watcher.getState('source-project')
    expect(afterSourceState.state).toBe('stopped')

    // Target should be running
    const targetState = watcher.getState('target-project')
    expect(targetState.state).toBe('running')

    // Cleanup
    watcher.stop()
  })

  test('remapProject with stopped source does not start target', () => {
    const watcher = new FileChangeWatcher()

    // Source is not started
    const sourceState = watcher.getState('source-project')
    expect(sourceState.state).toBe('stopped')

    // Remap should not start target
    watcher.remapProject('source-project', 'target-project')

    const targetState = watcher.getState('target-project')
    expect(targetState.state).toBe('stopped')

    // Cleanup
    watcher.stop()
  })

  test('remapProject preserves poll interval', () => {
    const watcher = new FileChangeWatcher()

    watcher.start('source-project', 5000)
    watcher.remapProject('source-project', 'target-project')

    const targetState = watcher.getState('target-project')
    expect(targetState.pollMs).toBe(5000)

    // Cleanup
    watcher.stop()
  })
})

describe('watcher state machine: full lifecycle', () => {
  test('idle → running → blocked_forbidden → cooldown → stopped → running', () => {
    let state: WatcherFSMState = 'idle'
    expect(nextWatcherState(state, 'start')).toBe('running')
    state = 'running'
    expect(nextWatcherState(state, 'forbidden_error')).toBe('blocked_forbidden')
    state = 'blocked_forbidden'
    expect(nextWatcherState(state, 'cooldown_start')).toBe('cooldown')
    state = 'cooldown'
    expect(nextWatcherState(state, 'cooldown_elapsed')).toBe('stopped')
    state = 'stopped'
    expect(nextWatcherState(state, 'restart')).toBe('running')
  })

  test('running → stopped (explicit stop)', () => {
    expect(nextWatcherState('running', 'stop')).toBe('stopped')
  })

  test('cooldown → stopped (cooldown elapsed)', () => {
    expect(nextWatcherState('cooldown', 'cooldown_elapsed')).toBe('stopped')
  })
})
