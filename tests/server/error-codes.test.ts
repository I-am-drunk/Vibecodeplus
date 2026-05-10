import { describe, test, expect } from 'bun:test'
import {
  ERROR_CODES,
  DYNAMIC_PREFIXES,
  ERROR_CODE_STATUS,
  isKnownErrorCode,
  INTERNAL_ERROR,
  VALIDATION_ERROR,
  INVALID_JSON,
  NOT_FOUND,
  UNAUTHORIZED,
  FORBIDDEN,
  CONFLICT,
  DEPENDENCY_ERROR,
  AUTH_FAILED,
  CREDITS_EXHAUSTED,
  NETWORK_ERROR,
  TIMEOUT,
  MIGRATION_IN_PROGRESS,
  MIGRATION_FAILED,
  MIGRATION_EXECUTION_ERROR,
  SOURCE_NOT_FOUND,
  AUTH_REQUIRED,
  ACQUIRE_TARGET_TIMEOUT,
  TARGET_SSH_CONNECT_FAILED,
  SNAPSHOT_TRANSFER_FAILED,
  VERIFY_TARGET_FAILED,
  TARGET_VERIFY_MISSING,
  CREATE_TARGET_PREFIX,
  ACQUIRE_TARGET_PREFIX,
  TARGET_VERIFY_PREFIX,
} from '../../server/lib/errorCodes.ts'

describe('error code registry', () => {
  test('all exported constants are in ERROR_CODES set', () => {
    expect(ERROR_CODES.has(INTERNAL_ERROR)).toBe(true)
    expect(ERROR_CODES.has(VALIDATION_ERROR)).toBe(true)
    expect(ERROR_CODES.has(INVALID_JSON)).toBe(true)
    expect(ERROR_CODES.has(NOT_FOUND)).toBe(true)
    expect(ERROR_CODES.has(UNAUTHORIZED)).toBe(true)
    expect(ERROR_CODES.has(FORBIDDEN)).toBe(true)
    expect(ERROR_CODES.has(CONFLICT)).toBe(true)
    expect(ERROR_CODES.has(DEPENDENCY_ERROR)).toBe(true)
    expect(ERROR_CODES.has(AUTH_FAILED)).toBe(true)
    expect(ERROR_CODES.has(CREDITS_EXHAUSTED)).toBe(true)
    expect(ERROR_CODES.has(NETWORK_ERROR)).toBe(true)
    expect(ERROR_CODES.has(TIMEOUT)).toBe(true)
    expect(ERROR_CODES.has(MIGRATION_IN_PROGRESS)).toBe(true)
    expect(ERROR_CODES.has(MIGRATION_FAILED)).toBe(true)
    expect(ERROR_CODES.has(MIGRATION_EXECUTION_ERROR)).toBe(true)
    expect(ERROR_CODES.has(SOURCE_NOT_FOUND)).toBe(true)
    expect(ERROR_CODES.has(AUTH_REQUIRED)).toBe(true)
    expect(ERROR_CODES.has(ACQUIRE_TARGET_TIMEOUT)).toBe(true)
    expect(ERROR_CODES.has(TARGET_SSH_CONNECT_FAILED)).toBe(true)
    expect(ERROR_CODES.has(SNAPSHOT_TRANSFER_FAILED)).toBe(true)
    expect(ERROR_CODES.has(VERIFY_TARGET_FAILED)).toBe(true)
    expect(ERROR_CODES.has(TARGET_VERIFY_MISSING)).toBe(true)
  })

  test('isKnownErrorCode recognizes static codes', () => {
    expect(isKnownErrorCode(INTERNAL_ERROR)).toBe(true)
    expect(isKnownErrorCode(VALIDATION_ERROR)).toBe(true)
    expect(isKnownErrorCode(FORBIDDEN)).toBe(true)
    expect(isKnownErrorCode(MIGRATION_FAILED)).toBe(true)
  })

  test('isKnownErrorCode recognizes dynamic prefix codes', () => {
    expect(isKnownErrorCode(`${CREATE_TARGET_PREFIX}AUTH_FAILED`)).toBe(true)
    expect(isKnownErrorCode(`${ACQUIRE_TARGET_PREFIX}TIMEOUT`)).toBe(true)
    expect(isKnownErrorCode(`${TARGET_VERIFY_PREFIX}NOT_FOUND`)).toBe(true)
  })

  test('isKnownErrorCode rejects unknown codes', () => {
    expect(isKnownErrorCode('UNKNOWN_CODE')).toBe(false)
    expect(isKnownErrorCode('')).toBe(false)
    expect(isKnownErrorCode(`${CREATE_TARGET_PREFIX}`)).toBe(true) // prefix itself matches
  })

  test('ERROR_CODE_STATUS maps codes to valid HTTP status codes', () => {
    for (const [code, status] of Object.entries(ERROR_CODE_STATUS)) {
      expect(Number.isInteger(status)).toBe(true)
      expect(status).toBeGreaterThanOrEqual(400)
      expect(status).toBeLessThanOrEqual(599)
    }
  })

  test('ERROR_CODE_STATUS has entries for all static codes', () => {
    for (const code of ERROR_CODES) {
      expect(ERROR_CODE_STATUS[code]).toBeDefined()
      expect(typeof ERROR_CODE_STATUS[code]).toBe('number')
    }
  })

  test('specific status mappings are correct', () => {
    expect(ERROR_CODE_STATUS[VALIDATION_ERROR]).toBe(422)
    expect(ERROR_CODE_STATUS[INVALID_JSON]).toBe(400)
    expect(ERROR_CODE_STATUS[NOT_FOUND]).toBe(404)
    expect(ERROR_CODE_STATUS[UNAUTHORIZED]).toBe(401)
    expect(ERROR_CODE_STATUS[FORBIDDEN]).toBe(403)
    expect(ERROR_CODE_STATUS[CONFLICT]).toBe(409)
    expect(ERROR_CODE_STATUS[AUTH_FAILED]).toBe(403)
    expect(ERROR_CODE_STATUS[CREDITS_EXHAUSTED]).toBe(402)
    expect(ERROR_CODE_STATUS[NETWORK_ERROR]).toBe(503)
    expect(ERROR_CODE_STATUS[TIMEOUT]).toBe(504)
    expect(ERROR_CODE_STATUS[DEPENDENCY_ERROR]).toBe(502)
    expect(ERROR_CODE_STATUS[MIGRATION_IN_PROGRESS]).toBe(409)
  })

  test('DYNAMIC_PREFIXES are non-empty strings', () => {
    for (const prefix of DYNAMIC_PREFIXES) {
      expect(typeof prefix).toBe('string')
      expect(prefix.length).toBeGreaterThan(0)
      expect(prefix.endsWith('_')).toBe(true)
    }
  })

  test('no duplicate codes in ERROR_CODES', () => {
    const arr = Array.from(ERROR_CODES)
    expect(new Set(arr).size).toBe(arr.length)
  })
})
