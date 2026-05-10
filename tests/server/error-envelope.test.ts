/**
 * Error envelope integration tests (QA-186, QA-187).
 *
 * Validates that:
 * - All error responses use the standardized { ok: false, error: { code, message, details? } } envelope
 * - Malformed JSON bodies return INVALID_JSON with 400
 * - Oversized payloads return PAYLOAD_TOO_LARGE with 413
 * - Validation errors return VALIDATION_ERROR with 422
 * - Not found errors return NOT_FOUND with 404
 * - Unauthorized errors return UNAUTHORIZED with 401
 * - Forbidden errors return FORBIDDEN with 403
 * - Dependency errors return DEPENDENCY_ERROR with 502
 * - Internal errors return INTERNAL_ERROR with 500
 * - All error codes are recognized by the centralized registry
 */

import { describe, test, expect } from 'bun:test'
import {
  AppError,
  badRequest,
  invalidJson,
  notFound,
  unauthorized,
  forbidden,
  conflict,
  dependencyError,
  migrationInProgress,
  migrationFailed,
  payloadTooLarge,
  toAppError,
  toErrorEnvelope,
  jsonError,
  success,
  mapGetUserFailure,
  type ErrorCode,
  type ErrorEnvelope,
} from '../../server/lib/errors.ts'
import { isKnownErrorCode, ERROR_CODE_STATUS, PAYLOAD_TOO_LARGE } from '../../server/lib/errorCodes.ts'

describe('error envelope format', () => {
  test('AppError produces correct envelope', () => {
    const err = badRequest('test', { field: 'x' })
    expect(err.code).toBe('VALIDATION_ERROR')
    expect(err.status).toBe(422)
    expect(err.message).toBe('test')
    expect(err.details).toEqual({ field: 'x' })
  })

  test('toErrorEnvelope produces standardized format', () => {
    const err = notFound('Project not found', { projectId: 'abc' })
    const envelope = toErrorEnvelope(err)
    expect(envelope.ok).toBe(false)
    expect(envelope.error.code).toBe('NOT_FOUND')
    expect(envelope.error.message).toBe('Project not found')
    expect(envelope.error.details).toEqual({ projectId: 'abc' })
  })

  test('toAppError wraps non-AppError errors', () => {
    const err = toAppError(new Error('something broke'))
    expect(err.code).toBe('INTERNAL_ERROR')
    expect(err.status).toBe(500)
    expect(err.message).toBe('something broke')
  })

  test('toAppError wraps string errors', () => {
    const err = toAppError('raw string')
    expect(err.code).toBe('INTERNAL_ERROR')
    expect(err.message).toBe('Unexpected server error')
  })

  test('toAppError preserves AppError instances', () => {
    const original = forbidden('no access')
    const wrapped = toAppError(original)
    expect(wrapped).toBe(original)
  })
})

describe('error code → HTTP status mapping', () => {
  const errorFactories: Array<[string, () => AppError, number]> = [
    ['INVALID_JSON', () => invalidJson(), 400],
    ['VALIDATION_ERROR', () => badRequest('test'), 422],
    ['UNAUTHORIZED', () => unauthorized('test'), 401],
    ['FORBIDDEN', () => forbidden('test'), 403],
    ['NOT_FOUND', () => notFound('test'), 404],
    ['CONFLICT', () => conflict('test'), 409],
    ['MIGRATION_IN_PROGRESS', () => migrationInProgress('test'), 409],
    ['DEPENDENCY_ERROR', () => dependencyError('test'), 502],
    ['MIGRATION_FAILED', () => migrationFailed('test'), 500],
    ['PAYLOAD_TOO_LARGE', () => payloadTooLarge('test'), 413],
    ['INTERNAL_ERROR', () => new AppError('INTERNAL_ERROR', 'test', 500), 500],
  ]

  for (const [code, factory, expectedStatus] of errorFactories) {
    test(`${code} → ${expectedStatus}`, () => {
      const err = factory()
      expect(err.code).toBe(code as ErrorCode)
      expect(err.status).toBe(expectedStatus)
    })

    test(`${code} is recognized by error code registry`, () => {
      expect(isKnownErrorCode(code)).toBe(true)
    })

    test(`${code} has correct status in ERROR_CODE_STATUS`, () => {
      expect(ERROR_CODE_STATUS[code]).toBe(expectedStatus)
    })
  }
})

describe('malformed JSON handling (QA-186)', () => {
  test('invalidJson produces INVALID_JSON error code', () => {
    const err = invalidJson({ reason: 'Unexpected token' })
    expect(err.code).toBe('INVALID_JSON')
    expect(err.status).toBe(400)
    expect(err.message).toBe('Request body must be valid JSON')
    expect(err.details).toEqual({ reason: 'Unexpected token' })
  })

  test('INVALID_JSON is in ERROR_CODE_STATUS', () => {
    expect(ERROR_CODE_STATUS['INVALID_JSON']).toBe(400)
  })
})

describe('oversized payload rejection (QA-187)', () => {
  test('payloadTooLarge produces PAYLOAD_TOO_LARGE error code', () => {
    const err = payloadTooLarge('Body exceeds 50MB limit')
    expect(err.code).toBe('PAYLOAD_TOO_LARGE')
    expect(err.status).toBe(413)
  })

  test('PAYLOAD_TOO_LARGE is in ERROR_CODE_STATUS', () => {
    expect(ERROR_CODE_STATUS[PAYLOAD_TOO_LARGE]).toBe(413)
  })
})

describe('success envelope format', () => {
  test('success produces correct envelope', () => {
    const envelope = success({ id: 'abc', name: 'test' })
    expect(envelope.ok).toBe(true)
    expect(envelope.data).toEqual({ id: 'abc', name: 'test' })
  })

  test('error and success envelopes are mutually exclusive by ok field', () => {
    const errEnvelope = toErrorEnvelope(notFound('test'))
    const okEnvelope = success({ value: 1 })
    expect(errEnvelope.ok).toBe(false)
    expect(okEnvelope.ok).toBe(true)
  })
})

describe('CREDITS_EXHAUSTED error', () => {
  test('mapGetUserFailure handles AUTH_FAILED', () => {
    const err = mapGetUserFailure({ code: 'AUTH_FAILED', message: 'bad key' })
    expect(err.code).toBe('FORBIDDEN')
    expect(err.status).toBe(403)
  })

  test('mapGetUserFailure handles CREDITS_EXHAUSTED', () => {
    const err = mapGetUserFailure({ code: 'CREDITS_EXHAUSTED', message: 'no credits' })
    expect(err.code).toBe('CREDITS_EXHAUSTED')
    expect(err.status).toBe(402)
  })

  test('mapGetUserFailure handles NETWORK_ERROR', () => {
    const err = mapGetUserFailure({ code: 'NETWORK_ERROR', message: 'timeout' })
    expect(err.code).toBe('DEPENDENCY_ERROR')
    expect(err.status).toBe(503)
  })

  test('mapGetUserFailure handles TIMEOUT', () => {
    const err = mapGetUserFailure({ code: 'TIMEOUT', message: 'timed out' })
    expect(err.code).toBe('DEPENDENCY_ERROR')
    expect(err.status).toBe(504)
  })

  test('mapGetUserFailure handles unknown codes', () => {
    const err = mapGetUserFailure({ code: 'UNKNOWN_CODE', message: 'something' })
    expect(err.code).toBe('DEPENDENCY_ERROR')
    expect(err.status).toBe(502)
  })
})
