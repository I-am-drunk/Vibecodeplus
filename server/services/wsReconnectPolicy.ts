/**
 * WS Reconnect Policy (CP-36).
 *
 * Bounded exponential backoff for WebSocket reconnections
 * with duplicate handler prevention.
 *
 * This is used by the client-side reconnect logic and can be
 * shared with server-side validation of reconnect attempts.
 */

const BASE_DELAY_MS = 1000
const MAX_DELAY_MS = 10_000
const MAX_ATTEMPTS = 10

/**
 * Compute the reconnect delay for a given attempt number.
 * Uses exponential backoff with jitter, bounded by MAX_DELAY_MS.
 *
 * @param attempt - 1-based attempt number (1 = first reconnect)
 * @returns delay in milliseconds
 */
export function computeReconnectDelay(attempt: number): number {
  if (attempt < 1) return BASE_DELAY_MS
  const exponential = BASE_DELAY_MS * Math.pow(2, attempt - 1)
  const jitter = Math.random() * 500
  return Math.min(exponential + jitter, MAX_DELAY_MS)
}

/**
 * Check if a reconnect attempt is within bounds.
 */
export function isReconnectAllowed(attempt: number): boolean {
  return attempt <= MAX_ATTEMPTS
}

/**
 * Reset the reconnect attempt counter (called on successful connection).
 */
export function resetReconnectState(): { attempt: number } {
  return { attempt: 0 }
}

/**
 * Track registered WS event handlers to prevent duplicate registration.
 * This is the server-side guard for CP-36.
 */
export class HandlerRegistry {
  private registered = new Set<string>()

  /**
   * Register a handler key. Returns true if this is a new registration,
   * false if it was already registered (duplicate prevention).
   */
  register(key: string): boolean {
    if (this.registered.has(key)) return false
    this.registered.add(key)
    return true
  }

  /**
   * Unregister a handler key.
   */
  unregister(key: string): void {
    this.registered.delete(key)
  }

  /**
   * Check if a handler key is registered.
   */
  isRegistered(key: string): boolean {
    return this.registered.has(key)
  }

  /**
   * Clear all registrations.
   */
  clear(): void {
    this.registered.clear()
  }

  /**
   * Get the count of registered handlers.
   */
  get size(): number {
    return this.registered.size
  }
}

export { BASE_DELAY_MS, MAX_DELAY_MS, MAX_ATTEMPTS }
