/**
 * Centralized error code registry (CP-03).
 *
 * Every error code used across the server is defined here as a constant.
 * This ensures:
 *   1. No typo-susceptible string literals scattered across routes
 *   2. Single source of truth for client error mapping
 *   3. Easy grep/audit to find all usages of a given code
 *   4. Future telemetry aggregation by code
 *
 * Convention: UPPER_SNAKE_CASE, prefixed by subsystem where applicable.
 */

// ── Generic HTTP error codes ──────────────────────────────────────────
export const INTERNAL_ERROR = 'INTERNAL_ERROR'
export const VALIDATION_ERROR = 'VALIDATION_ERROR'
export const INVALID_JSON = 'INVALID_JSON'
export const NOT_FOUND = 'NOT_FOUND'
export const UNAUTHORIZED = 'UNAUTHORIZED'
export const FORBIDDEN = 'FORBIDDEN'
export const CONFLICT = 'CONFLICT'
export const PAYLOAD_TOO_LARGE = 'PAYLOAD_TOO_LARGE'
export const STREAM_CONFLICT = 'STREAM_CONFLICT'

// ── Dependency / upstream error codes ──────────────────────────────────
export const DEPENDENCY_ERROR = 'DEPENDENCY_ERROR'

// ── Auth-specific error codes ──────────────────────────────────────────
export const AUTH_FAILED = 'AUTH_FAILED'
export const CREDITS_EXHAUSTED = 'CREDITS_EXHAUSTED'
export const NETWORK_ERROR = 'NETWORK_ERROR'
export const TIMEOUT = 'TIMEOUT'

// ── Migration error codes ──────────────────────────────────────────────
export const MIGRATION_IN_PROGRESS = 'MIGRATION_IN_PROGRESS'
export const MIGRATION_FAILED = 'MIGRATION_FAILED'
export const MIGRATION_EXECUTION_ERROR = 'MIGRATION_EXECUTION_ERROR'
export const MIGRATION_CANCELLED = 'MIGRATION_CANCELLED'
export const SOURCE_NOT_FOUND = 'SOURCE_NOT_FOUND'
export const AUTH_REQUIRED = 'AUTH_REQUIRED'
export const CREATE_TARGET_PREFIX = 'CREATE_TARGET_'
export const ACQUIRE_TARGET_TIMEOUT = 'ACQUIRE_TARGET_TIMEOUT'
export const ACQUIRE_TARGET_PREFIX = 'ACQUIRE_TARGET_'
export const TARGET_SSH_CONNECT_FAILED = 'TARGET_SSH_CONNECT_FAILED'
export const SNAPSHOT_TRANSFER_FAILED = 'SNAPSHOT_TRANSFER_FAILED'
export const VERIFY_TARGET_FAILED = 'VERIFY_TARGET_FAILED'
export const TARGET_VERIFY_MISSING = 'TARGET_VERIFY_MISSING'
export const TARGET_VERIFY_PREFIX = 'TARGET_VERIFY_'

// ── CLI error codes ───────────────────────────────────────────────────
export const CLI_NOT_FOUND = 'CLI_NOT_FOUND'
export const CLI_PARSE_ERROR = 'PARSE_ERROR'
export const CLI_PROCESS_ERROR = 'PROCESS_ERROR'
export const CLI_UNKNOWN = 'UNKNOWN'

// ── Complete registry for validation / telemetry ───────────────────────

/**
 * All known error codes. Used for:
 *  - Validating that error codes in DB/logs are recognized
 *  - Building client-side error maps
 *  - Telemetry dashboards
 *
 * Dynamic codes (prefixed like CREATE_TARGET_*) are not listed individually
 * but are validated by prefix match.
 */
export const ERROR_CODES = new Set([
  INTERNAL_ERROR,
  VALIDATION_ERROR,
  INVALID_JSON,
  NOT_FOUND,
  UNAUTHORIZED,
  FORBIDDEN,
  CONFLICT,
  PAYLOAD_TOO_LARGE,
  DEPENDENCY_ERROR,
  AUTH_FAILED,
  CREDITS_EXHAUSTED,
  NETWORK_ERROR,
  TIMEOUT,
  MIGRATION_IN_PROGRESS,
  MIGRATION_FAILED,
  MIGRATION_EXECUTION_ERROR,
  MIGRATION_CANCELLED,
  SOURCE_NOT_FOUND,
  AUTH_REQUIRED,
  ACQUIRE_TARGET_TIMEOUT,
  TARGET_SSH_CONNECT_FAILED,
  SNAPSHOT_TRANSFER_FAILED,
  VERIFY_TARGET_FAILED,
  TARGET_VERIFY_MISSING,
  STREAM_CONFLICT,
  CLI_NOT_FOUND,
  CLI_PARSE_ERROR,
  CLI_PROCESS_ERROR,
  CLI_UNKNOWN,
])

/** Dynamic-prefix codes that are valid if they start with the prefix */
export const DYNAMIC_PREFIXES = [
  CREATE_TARGET_PREFIX,
  ACQUIRE_TARGET_PREFIX,
  TARGET_VERIFY_PREFIX,
] as const

/**
 * Check whether an error code is known (either exact match or dynamic prefix).
 */
export function isKnownErrorCode(code: string): boolean {
  if (ERROR_CODES.has(code)) return true
  return DYNAMIC_PREFIXES.some((prefix) => code.startsWith(prefix))
}

/**
 * HTTP status mapping for known error codes.
 * Used by the client error map and by route error handlers.
 */
export const ERROR_CODE_STATUS: Record<string, number> = {
  [INTERNAL_ERROR]: 500,
  [VALIDATION_ERROR]: 422,
  [INVALID_JSON]: 400,
  [NOT_FOUND]: 404,
  [UNAUTHORIZED]: 401,
  [FORBIDDEN]: 403,
  [CONFLICT]: 409,
  [STREAM_CONFLICT]: 409,
  [PAYLOAD_TOO_LARGE]: 413,
  [DEPENDENCY_ERROR]: 502,
  [AUTH_FAILED]: 403,
  [CREDITS_EXHAUSTED]: 402,
  [NETWORK_ERROR]: 503,
  [TIMEOUT]: 504,
  [MIGRATION_IN_PROGRESS]: 409,
  [MIGRATION_FAILED]: 500,
  [MIGRATION_EXECUTION_ERROR]: 500,
  [MIGRATION_CANCELLED]: 499,
  [SOURCE_NOT_FOUND]: 404,
  [AUTH_REQUIRED]: 401,
  [ACQUIRE_TARGET_TIMEOUT]: 504,
  [TARGET_SSH_CONNECT_FAILED]: 502,
  [SNAPSHOT_TRANSFER_FAILED]: 502,
  [VERIFY_TARGET_FAILED]: 502,
  [TARGET_VERIFY_MISSING]: 502,
  [CLI_NOT_FOUND]: 502,
  [CLI_PARSE_ERROR]: 502,
  [CLI_PROCESS_ERROR]: 502,
  [CLI_UNKNOWN]: 500,
}
