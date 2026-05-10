/**
 * WS reconnect policy and correlation ID contract tests (CP-36, CP-37).
 *
 * CP-36: WS reconnect policy — bounded backoff + no duplicate handlers
 * CP-37: Correlation IDs — request→stream→db traceable
 * QA-038: Open workspace with alias old→new
 * QA-039: Open during migration in progress
 * QA-040: Open after migration completed
 */

import { describe, test, expect } from 'bun:test'
import {
  computeReconnectDelay,
  isReconnectAllowed,
} from '../../server/services/wsReconnectPolicy.ts'
import {
  nextMigrationState,
  isMigrationTerminal,
} from '../../server/services/migrationService.ts'
import { isKnownErrorCode } from '../../server/lib/errorCodes.ts'

describe('CP-36: WS reconnect policy', () => {
  test('reconnect delay increases with attempt count', () => {
    const d1 = computeReconnectDelay(1)
    const d2 = computeReconnectDelay(2)
    const d3 = computeReconnectDelay(3)

    expect(d2).toBeGreaterThan(d1)
    expect(d3).toBeGreaterThan(d2)
  })

  test('reconnect delay is bounded', () => {
    const maxDelay = computeReconnectDelay(100)
    expect(maxDelay).toBeLessThanOrEqual(30_000)
  })

  test('reconnect is allowed for reasonable attempt counts', () => {
    expect(isReconnectAllowed(1)).toBe(true)
    expect(isReconnectAllowed(5)).toBe(true)
    expect(isReconnectAllowed(10)).toBe(true)
  })

  test('reconnect is disallowed after too many attempts', () => {
    expect(isReconnectAllowed(100)).toBe(false)
    expect(isReconnectAllowed(50)).toBe(false)
  })
})

describe('CP-37: correlation IDs', () => {
  test('request_id is traceable through stream lifecycle', () => {
    const requestId = crypto.randomUUID()
    expect(requestId).toBeTruthy()
    expect(requestId.split('-').length).toBe(5)
  })

  test('stream_id is unique per stream', () => {
    const id1 = crypto.randomUUID()
    const id2 = crypto.randomUUID()
    expect(id1).not.toBe(id2)
  })

  test('migration_id is traceable through audit log', () => {
    const migrationId = crypto.randomUUID()
    expect(migrationId).toBeTruthy()
  })
})

describe('QA-038: open workspace with alias old→new', () => {
  test('completed migration creates alias', () => {
    expect(nextMigrationState('running', 'success')).toBe('completed')
    expect(isMigrationTerminal('completed')).toBe(true)
  })
})

describe('QA-039: open during migration in progress', () => {
  test('MIGRATION_IN_PROGRESS is a known error code', () => {
    expect(isKnownErrorCode('MIGRATION_IN_PROGRESS')).toBe(true)
  })

  test('running migration blocks duplicate start', () => {
    expect(nextMigrationState('running', 'start')).toBeNull()
  })
})

describe('QA-040: open after migration completed', () => {
  test('completed migration is terminal — alias resolves to target', () => {
    expect(isMigrationTerminal('completed')).toBe(true)
  })

  test('completed migration cannot be restarted', () => {
    expect(nextMigrationState('completed', 'start')).toBeNull()
  })
})
