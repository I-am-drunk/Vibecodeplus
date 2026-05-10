/**
 * Watcher State Machine service (CP-17..CP-21).
 *
 * Formalizes the file watcher FSM transitions:
 *   idle → running → (blocked_forbidden → cooldown → stopped → running)* → stopped
 *
 * Extracted from ssh/watcher.ts for testability in isolation.
 */

export type WatcherFSMState = 'idle' | 'running' | 'blocked_forbidden' | 'cooldown' | 'stopped'

export interface WatcherFSMTransition {
  from: WatcherFSMState
  to: WatcherFSMState
  trigger: string
}

/**
 * Legal state transitions for the watcher FSM.
 * Each entry is [from, to, triggerName].
 */
export const WATCHER_TRANSITIONS: ReadonlyArray<[WatcherFSMState, WatcherFSMState, string]> = [
  ['idle', 'running', 'start'],
  ['running', 'running', 'poll_success'],
  ['running', 'blocked_forbidden', 'forbidden_error'],
  ['running', 'stopped', 'stop'],
  ['blocked_forbidden', 'cooldown', 'cooldown_start'],
  ['cooldown', 'stopped', 'cooldown_elapsed'],
  ['stopped', 'running', 'restart'],
  ['stopped', 'idle', 'cleanup'],
]

const transitionMap = new Map<string, WatcherFSMState>()
for (const [from, to, trigger] of WATCHER_TRANSITIONS) {
  transitionMap.set(`${from}:${trigger}`, to)
}

/**
 * Compute the next state given current state and trigger.
 * Returns null if the transition is illegal.
 */
export function nextWatcherState(current: WatcherFSMState, trigger: string): WatcherFSMState | null {
  return transitionMap.get(`${current}:${trigger}`) ?? null
}

/**
 * Check if a transition is legal.
 */
export function isLegalWatcherTransition(current: WatcherFSMState, trigger: string): boolean {
  return transitionMap.has(`${current}:${trigger}`)
}

/**
 * Compute exponential backoff cooldown for forbidden failures.
 * BASE * 2^(n-1) + jitter, capped at MAX.
 */
export function computeBackoff(failureCount: number, baseMs: number, maxMs: number): number {
  const jitter = Math.random() * 2000
  return Math.min(baseMs * Math.pow(2, failureCount - 1) + jitter, maxMs)
}

/**
 * Determine if an error message indicates a forbidden/auth failure.
 */
export function isForbiddenError(message: string): boolean {
  const normalized = message.toLowerCase()
  return (
    normalized.includes('forbidden') ||
    normalized.includes('unauthorized') ||
    normalized.includes('authentication') ||
    normalized.includes('permission denied') ||
    normalized.includes('acquiring sandbox failed') ||
    normalized.includes('no ssh auth method') ||
    normalized.includes('too many failed ssh attempts')
  )
}
