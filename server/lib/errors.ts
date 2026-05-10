import type { Context } from 'hono'
import { ERROR_CODE_STATUS, isKnownErrorCode, PAYLOAD_TOO_LARGE as PAYLOAD_TOO_LARGE_CODE } from './errorCodes.ts'

export type ErrorCode =
  | 'INVALID_JSON'
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'CREDITS_EXHAUSTED'
  | 'DEPENDENCY_ERROR'
  | 'MIGRATION_IN_PROGRESS'
  | 'MIGRATION_FAILED'
  | 'MIGRATION_CANCELLED'
  | 'STREAM_CONFLICT'
  | 'PAYLOAD_TOO_LARGE'
  | 'INTERNAL_ERROR'

export type ErrorEnvelope = {
  ok: false
  error: {
    code: ErrorCode
    message: string
    details?: unknown
  }
}

export type SuccessEnvelope<T> = {
  ok: true
  data: T
}

export class AppError extends Error {
  code: ErrorCode
  status: number
  details?: unknown

  constructor(code: ErrorCode, message: string, status: number, details?: unknown) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.status = status
    this.details = details
  }
}

export function success<T>(data: T): SuccessEnvelope<T> {
  return { ok: true, data }
}

export function isErrorWithMessage(value: unknown): value is { message: string } {
  return typeof value === 'object' && value !== null && 'message' in value && typeof (value as any).message === 'string'
}

export function toAppError(error: unknown, fallbackStatus = 500): AppError {
  if (error instanceof AppError) return error

  if (isErrorWithMessage(error)) {
    return new AppError('INTERNAL_ERROR', error.message, fallbackStatus)
  }

  return new AppError('INTERNAL_ERROR', 'Unexpected server error', fallbackStatus)
}

export function toErrorEnvelope(error: unknown): ErrorEnvelope {
  const appError = toAppError(error)
  return {
    ok: false,
    error: {
      code: appError.code,
      message: appError.message,
      details: appError.details,
    },
  }
}

export function jsonError(c: Context, error: unknown, fallbackStatus = 500) {
  const appError = toAppError(error, fallbackStatus)
  return c.json(
    {
      ok: false,
      error: {
        code: appError.code,
        message: appError.message,
        details: appError.details,
      },
    } satisfies ErrorEnvelope,
    appError.status as any,
  )
}

export function badRequest(message: string, details?: unknown) {
  return new AppError('VALIDATION_ERROR', message, 422, details)
}

export function invalidJson(details?: unknown) {
  return new AppError('INVALID_JSON', 'Request body must be valid JSON', 400, details)
}

export function notFound(message: string, details?: unknown) {
  return new AppError('NOT_FOUND', message, 404, details)
}

export function unauthorized(message: string, details?: unknown) {
  return new AppError('UNAUTHORIZED', message, 401, details)
}

export function forbidden(message: string, details?: unknown) {
  return new AppError('FORBIDDEN', message, 403, details)
}

export function conflict(message: string, details?: unknown) {
  return new AppError('CONFLICT', message, 409, details)
}

export function dependencyError(message: string, details?: unknown) {
  return new AppError('DEPENDENCY_ERROR', message, 502, details)
}

export function migrationInProgress(message: string, details?: unknown) {
  return new AppError('MIGRATION_IN_PROGRESS', message, 409, details)
}

export function migrationFailed(message: string, details?: unknown) {
  return new AppError('MIGRATION_FAILED', message, 500, details)
}

export function payloadTooLarge(message: string, details?: unknown) {
  return new AppError('PAYLOAD_TOO_LARGE', message, 413, details)
}

/**
 * Map a CLI/dependency error code to an appropriate AppError.
 * Centralized here to avoid circular imports between routes and lib modules.
 */
export function mapGetUserFailure(error: { code: string; message?: string }): AppError {
  if (error.code === 'AUTH_FAILED') {
    return forbidden('API key is invalid or account is restricted. Please update your API key in Settings.', {
      dependencyCode: error.code,
    })
  }

  if (error.code === 'CREDITS_EXHAUSTED') {
    return new AppError(
      'CREDITS_EXHAUSTED',
      'This API key has zero credits. Please add credits at vibecode.dev/payments before using it.',
      402,
    )
  }

  if (error.code === 'NETWORK_ERROR') {
    return new AppError('DEPENDENCY_ERROR', error.message || 'Network error contacting API', 503, {
      dependencyCode: error.code,
    })
  }

  if (error.code === 'TIMEOUT') {
    return new AppError('DEPENDENCY_ERROR', error.message || 'Request timed out', 504, {
      dependencyCode: error.code,
    })
  }

  return new AppError('DEPENDENCY_ERROR', error.message || 'Authentication failed', 502, {
    dependencyCode: error.code,
  })
}
