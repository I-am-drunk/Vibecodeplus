import { describe, test, expect } from 'bun:test'
import {
  withCorrelation,
  getCorrelation,
  updateCorrelation,
  generateRequestId,
  resolveRequestId,
  correlationLogBindings,
  type CorrelationContext,
} from '../../server/lib/correlation.ts'

describe('correlation ID propagation', () => {
  test('getCorrelation returns empty context outside scope', () => {
    const ctx = getCorrelation()
    expect(ctx.requestId).toBe('')
    expect(ctx.projectId).toBeUndefined()
    expect(ctx.streamId).toBeUndefined()
    expect(ctx.migrationId).toBeUndefined()
  })

  test('withCorrelation establishes context', () => {
    const result = withCorrelation({ requestId: 'test-123' }, () => {
      return getCorrelation()
    })
    expect(result.requestId).toBe('test-123')
  })

  test('withCorrelation restores previous context after scope', () => {
    withCorrelation({ requestId: 'outer' }, () => {
      const inner = withCorrelation({ requestId: 'inner' }, () => {
        return getCorrelation().requestId
      })
      expect(inner).toBe('inner')
      expect(getCorrelation().requestId).toBe('outer')
    })
  })

  test('updateCorrelation patches fields in current context', () => {
    withCorrelation({ requestId: 'r1' }, () => {
      updateCorrelation({ projectId: 'p1' })
      expect(getCorrelation().projectId).toBe('p1')

      updateCorrelation({ streamId: 's1' })
      expect(getCorrelation().streamId).toBe('s1')
      expect(getCorrelation().projectId).toBe('p1')
    })
  })

  test('updateCorrelation is no-op outside scope', () => {
    // Should not throw
    updateCorrelation({ projectId: 'should-not-set' })
    expect(getCorrelation().requestId).toBe('')
  })

  test('generateRequestId produces valid UUIDs', () => {
    const id = generateRequestId()
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  })

  test('generateRequestId produces unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateRequestId()))
    expect(ids.size).toBe(100)
  })

  test('resolveRequestId accepts valid X-Request-Id header', () => {
    expect(resolveRequestId('my-req-123')).toBe('my-req-123')
    expect(resolveRequestId('abc')).toBe('abc')
    expect(resolveRequestId('a-b-c-d-e')).toBe('a-b-c-d-e')
  })

  test('resolveRequestId rejects invalid X-Request-Id and generates one', () => {
    // Too long
    const longId = 'a'.repeat(65)
    const result1 = resolveRequestId(longId)
    expect(result1).not.toBe(longId)
    expect(result1.length).toBeLessThan(65)

    // Contains invalid characters
    const result2 = resolveRequestId('has spaces')
    expect(result2).not.toBe('has spaces')

    // Contains special chars
    const result3 = resolveRequestId('has/slash')
    expect(result3).not.toBe('has/slash')

    // Empty string
    const result4 = resolveRequestId('')
    expect(result4).not.toBe('')

    // Undefined
    const result5 = resolveRequestId(undefined)
    expect(result5).toMatch(/^[0-9a-f]{8}-/)
  })

  test('correlationLogBindings includes set fields', () => {
    withCorrelation({ requestId: 'r1', projectId: 'p1' }, () => {
      const bindings = correlationLogBindings()
      expect(bindings.request_id).toBe('r1')
      expect(bindings.project_id).toBe('p1')
      expect(bindings.stream_id).toBeUndefined()
      expect(bindings.migration_id).toBeUndefined()
    })
  })

  test('correlationLogBindings includes all fields when set', () => {
    withCorrelation({ requestId: 'r1', projectId: 'p1', streamId: 's1', migrationId: 'm1' }, () => {
      const bindings = correlationLogBindings()
      expect(bindings.request_id).toBe('r1')
      expect(bindings.project_id).toBe('p1')
      expect(bindings.stream_id).toBe('s1')
      expect(bindings.migration_id).toBe('m1')
    })
  })

  test('correlationLogBindings returns empty object outside scope', () => {
    const bindings = correlationLogBindings()
    expect(Object.keys(bindings).length).toBe(0)
  })

  test('context is isolated between concurrent async operations', async () => {
    const results = await Promise.all([
      withCorrelation({ requestId: 'r-a' }, async () => {
        await new Promise((r) => setTimeout(r, 5))
        updateCorrelation({ projectId: 'p-a' })
        await new Promise((r) => setTimeout(r, 5))
        return getCorrelation()
      }),
      withCorrelation({ requestId: 'r-b' }, async () => {
        await new Promise((r) => setTimeout(r, 2))
        updateCorrelation({ projectId: 'p-b' })
        await new Promise((r) => setTimeout(r, 10))
        return getCorrelation()
      }),
    ])

    expect(results[0].requestId).toBe('r-a')
    expect(results[0].projectId).toBe('p-a')
    expect(results[1].requestId).toBe('r-b')
    expect(results[1].projectId).toBe('p-b')
  })

  test('full request→stream→DB traceability simulation', () => {
    // Simulate the full lifecycle of a chat request
    const requestId = generateRequestId()

    withCorrelation({ requestId }, () => {
      // Step 1: Request arrives, project resolved
      updateCorrelation({ projectId: 'proj-1' })
      const ctx1 = getCorrelation()
      expect(ctx1.requestId).toBe(requestId)
      expect(ctx1.projectId).toBe('proj-1')

      // Step 2: Stream created
      updateCorrelation({ streamId: 'stream-1' })
      const ctx2 = getCorrelation()
      expect(ctx2.streamId).toBe('stream-1')

      // Step 3: Log bindings capture full trace
      const bindings = correlationLogBindings()
      expect(bindings.request_id).toBe(requestId)
      expect(bindings.project_id).toBe('proj-1')
      expect(bindings.stream_id).toBe('stream-1')

      // Step 4: requestId flows to DB persistence
      // (In real code, this would be passed to saveAssistantMessage)
      const dbRequestId = getCorrelation().requestId
      expect(dbRequestId).toBe(requestId)
    })
  })
})
