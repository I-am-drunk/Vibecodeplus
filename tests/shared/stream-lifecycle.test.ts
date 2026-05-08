import { describe, expect, test } from 'bun:test'
import { createStreamLifecycleGuard } from '../../client/src/lib/streamLifecycle.ts'
import { StreamRegistry } from '../../server/state/streams.ts'

describe('stream terminal idempotency and ordering', () => {
  test('client stream guard dedupes duplicate and out-of-order terminal events', () => {
    const guard = createStreamLifecycleGuard()

    expect(guard.start('session-1', 'stream-1', 1).accepted).toBe(true)
    expect(guard.acceptEvent('session-1', 'stream-1', 2).accepted).toBe(true)
    expect(guard.acceptEvent('session-1', 'stream-1', 2).accepted).toBe(false)
    expect(guard.acceptEvent('session-1', 'stream-1', 1).accepted).toBe(false)

    expect(guard.acceptTerminal('session-1', 'stream-1', 3, 'complete').accepted).toBe(true)
    expect(guard.acceptTerminal('session-1', 'stream-1', 4, 'error').accepted).toBe(false)
    expect(guard.acceptEvent('session-1', 'stream-1', 5).accepted).toBe(false)
  })

  test('server stream registry enforces single terminal state per stream', () => {
    const registry = new StreamRegistry()
    const abortController = new AbortController()

    const stream = registry.register('session-1', 'project-1', abortController)
    expect(registry.markTerminal('session-1', stream.streamId, 'complete')).toBe(true)
    expect(registry.markTerminal('session-1', stream.streamId, 'error')).toBe(false)

    registry.unregister('session-1', stream.streamId)
    expect(registry.isStreamFinalized(stream.streamId)).toBe(true)
  })
})
