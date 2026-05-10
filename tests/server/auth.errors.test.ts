import { describe, expect, test } from 'bun:test'
import { mapGetUserFailure } from '../../server/lib/errors.ts'

describe('auth error mapping', () => {
  test('AUTH_FAILED maps to FORBIDDEN', () => {
    const err = mapGetUserFailure({ code: 'AUTH_FAILED', message: 'forbidden' })
    expect(err.code).toBe('FORBIDDEN')
    expect(err.status).toBe(403)
  })

  test('CREDITS_EXHAUSTED maps to 402', () => {
    const err = mapGetUserFailure({ code: 'CREDITS_EXHAUSTED', message: 'no credits' })
    expect(err.code).toBe('CREDITS_EXHAUSTED')
    expect(err.status).toBe(402)
  })

  test('NETWORK_ERROR maps to 503', () => {
    const err = mapGetUserFailure({ code: 'NETWORK_ERROR', message: 'connection refused' })
    expect(err.code).toBe('DEPENDENCY_ERROR')
    expect(err.status).toBe(503)
  })

  test('TIMEOUT maps to 504', () => {
    const err = mapGetUserFailure({ code: 'TIMEOUT', message: 'request timed out' })
    expect(err.code).toBe('DEPENDENCY_ERROR')
    expect(err.status).toBe(504)
  })

  test('unknown codes map to DEPENDENCY_ERROR 502', () => {
    const err = mapGetUserFailure({ code: 'SOME_OTHER_ERROR', message: 'boom' })
    expect(err.code).toBe('DEPENDENCY_ERROR')
    expect(err.status).toBe(502)
  })

  test('preserves dependencyCode in details', () => {
    const err = mapGetUserFailure({ code: 'NETWORK_ERROR', message: 'fail' })
    expect(err.details).toEqual({ dependencyCode: 'NETWORK_ERROR' })
  })
})
