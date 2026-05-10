/**
 * Correlation ID propagation for request→stream→DB traceability (CP-37).
 *
 * Uses Node.js AsyncLocalStorage so that any code running inside a
 * request handler can access the current correlation context without
 * explicit parameter threading.
 *
 * Correlation context carries:
 *   request_id  – UUID assigned at HTTP request entry (or from X-Request-Id header)
 *   project_id  – resolved from the route when available
 *   stream_id   – set when a chat stream is created for this request
 *   migration_id – set when a continuation migration is started
 */

import { AsyncLocalStorage } from 'async_hooks'

export type CorrelationContext = {
  requestId: string
  projectId?: string
  streamId?: string
  migrationId?: string
}

const asyncStore = new AsyncLocalStorage<CorrelationContext>()

/**
 * Run a function with a correlation context.
 * Used by the middleware to establish the context for the entire request.
 */
export function withCorrelation<R>(ctx: CorrelationContext, fn: () => R): R {
  return asyncStore.run(ctx, fn)
}

/**
 * Get the current correlation context.
 * Returns an empty-ish object if called outside a correlation scope.
 */
export function getCorrelation(): CorrelationContext {
  const store = asyncStore.getStore()
  if (store) return { ...store }
  return { requestId: '' }
}

/**
 * Update fields on the current correlation context in-place.
 * Safe to call outside a correlation scope (no-op).
 */
export function updateCorrelation(patch: Partial<CorrelationContext>): void {
  const store = asyncStore.getStore()
  if (!store) return
  if (patch.projectId !== undefined) store.projectId = patch.projectId
  if (patch.streamId !== undefined) store.streamId = patch.streamId
  if (patch.migrationId !== undefined) store.migrationId = patch.migrationId
}

/**
 * Generate a new request ID.
 * Uses crypto.randomUUID for strong uniqueness.
 */
export function generateRequestId(): string {
  return crypto.randomUUID()
}

/**
 * Extract a request ID from the incoming request header, or generate one.
 * Accepts X-Request-Id from the client (max 64 chars, alphanumeric + dash).
 */
export function resolveRequestId(headerValue: string | undefined): string {
  if (headerValue && /^[a-zA-Z0-9-]{1,64}$/.test(headerValue)) {
    return headerValue
  }
  return generateRequestId()
}

/**
 * Return a flat object suitable for spreading into structured log entries.
 * Only includes fields that are actually set.
 */
export function correlationLogBindings(): Record<string, string> {
  const ctx = getCorrelation()
  const bindings: Record<string, string> = {}
  if (ctx.requestId) bindings.request_id = ctx.requestId
  if (ctx.projectId) bindings.project_id = ctx.projectId
  if (ctx.streamId) bindings.stream_id = ctx.streamId
  if (ctx.migrationId) bindings.migration_id = ctx.migrationId
  return bindings
}
