import { describe, expect, test } from 'bun:test'
import { createStreamLifecycleGuard } from '../../client/src/lib/streamLifecycle.ts'

describe('stream deduplication and sequence handling', () => {
  test('ignores out-of-order and duplicate sequences', () => {
    const guard = createStreamLifecycleGuard()
    
    // Start session
    expect(guard.start('session-1', 'stream-A', 1).accepted).toBe(true)

    // Accept next sequence
    expect(guard.acceptEvent('session-1', 'stream-A', 2).accepted).toBe(true)

    // Reject duplicate sequence
    expect(guard.acceptEvent('session-1', 'stream-A', 2).accepted).toBe(false)

    // Reject out of order sequence
    expect(guard.acceptEvent('session-1', 'stream-A', 1).accepted).toBe(false)

    // Accept next sequence
    expect(guard.acceptEvent('session-1', 'stream-A', 3).accepted).toBe(true)

    // Accept terminal
    expect(guard.acceptTerminal('session-1', 'stream-A', 4, 'complete').accepted).toBe(true)

    // Reject events after terminal
    expect(guard.acceptEvent('session-1', 'stream-A', 5).accepted).toBe(false)
    
    // Reject duplicate terminal
    expect(guard.acceptTerminal('session-1', 'stream-A', 5, 'error').accepted).toBe(false)
  })
})
