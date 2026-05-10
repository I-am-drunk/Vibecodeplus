import { describe, test, expect } from 'bun:test'
import {
  nextWatcherState,
  isLegalWatcherTransition,
  computeBackoff,
  isForbiddenError,
  type WatcherFSMState,
} from '../../server/services/watcherStateMachine.ts'

describe('watcher state machine', () => {
  describe('nextWatcherState', () => {
    test('idle → running on start', () => {
      expect(nextWatcherState('idle', 'start')).toBe('running')
    })

    test('running → running on poll_success', () => {
      expect(nextWatcherState('running', 'poll_success')).toBe('running')
    })

    test('running → blocked_forbidden on forbidden_error', () => {
      expect(nextWatcherState('running', 'forbidden_error')).toBe('blocked_forbidden')
    })

    test('running → stopped on stop', () => {
      expect(nextWatcherState('running', 'stop')).toBe('stopped')
    })

    test('blocked_forbidden → cooldown on cooldown_start', () => {
      expect(nextWatcherState('blocked_forbidden', 'cooldown_start')).toBe('cooldown')
    })

    test('cooldown → stopped on cooldown_elapsed', () => {
      expect(nextWatcherState('cooldown', 'cooldown_elapsed')).toBe('stopped')
    })

    test('stopped → running on restart', () => {
      expect(nextWatcherState('stopped', 'restart')).toBe('running')
    })

    test('stopped → idle on cleanup', () => {
      expect(nextWatcherState('stopped', 'cleanup')).toBe('idle')
    })

    test('illegal transitions return null', () => {
      expect(nextWatcherState('idle', 'forbidden_error')).toBeNull()
      expect(nextWatcherState('cooldown', 'start')).toBeNull()
      expect(nextWatcherState('blocked_forbidden', 'start')).toBeNull()
      expect(nextWatcherState('idle', 'stop')).toBeNull()
    })
  })

  describe('isLegalWatcherTransition', () => {
    test('matches nextWatcherState results', () => {
      expect(isLegalWatcherTransition('idle', 'start')).toBe(true)
      expect(isLegalWatcherTransition('running', 'forbidden_error')).toBe(true)
      expect(isLegalWatcherTransition('idle', 'forbidden_error')).toBe(false)
    })
  })

  describe('computeBackoff', () => {
    test('first failure uses BASE * 2^0 = BASE', () => {
      const result = computeBackoff(1, 10000, 300000)
      // BASE + jitter (0-2000)
      expect(result).toBeGreaterThanOrEqual(10000)
      expect(result).toBeLessThanOrEqual(12000)
    })

    test('second failure uses BASE * 2^1 = 2*BASE', () => {
      const result = computeBackoff(2, 10000, 300000)
      expect(result).toBeGreaterThanOrEqual(20000)
      expect(result).toBeLessThanOrEqual(22000)
    })

    test('third failure uses BASE * 2^2 = 4*BASE', () => {
      const result = computeBackoff(3, 10000, 300000)
      expect(result).toBeGreaterThanOrEqual(40000)
      expect(result).toBeLessThanOrEqual(42000)
    })

    test('never exceeds MAX', () => {
      const result = computeBackoff(100, 10000, 300000)
      expect(result).toBeLessThanOrEqual(300000)
    })
  })

  describe('isForbiddenError', () => {
    test('recognizes forbidden', () => {
      expect(isForbiddenError('403 Forbidden')).toBe(true)
    })

    test('recognizes unauthorized', () => {
      expect(isForbiddenError('Unauthorized access')).toBe(true)
    })

    test('recognizes authentication', () => {
      expect(isForbiddenError('Authentication failed')).toBe(true)
    })

    test('recognizes permission denied', () => {
      expect(isForbiddenError('Permission denied for resource')).toBe(true)
    })

    test('recognizes acquiring sandbox failed', () => {
      expect(isForbiddenError('Acquiring sandbox failed')).toBe(true)
    })

    test('rejects normal errors', () => {
      expect(isForbiddenError('Connection timeout')).toBe(false)
      expect(isForbiddenError('Network error')).toBe(false)
      expect(isForbiddenError('ENOENT')).toBe(false)
    })

    test('case insensitive', () => {
      expect(isForbiddenError('FORBIDDEN')).toBe(true)
      expect(isForbiddenError('forbidden')).toBe(true)
    })
  })
})
