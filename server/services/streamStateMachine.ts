/**
 * Stream State Machine service (CP-22..CP-28).
 *
 * Formalizes the chat stream lifecycle as a deterministic FSM:
 *   streaming → complete | cut_off | empty | error | aborted
 *
 * Terminal states are mutually exclusive and exactly-once.
 * Extracted from routes/chat.ts for testability in isolation.
 */

import type { StreamTerminalState, StreamRegistry } from '../state/streams.ts'
import { TERMINAL_COMPLETE, TERMINAL_CUT_OFF, TERMINAL_EMPTY, STREAM_ERROR, TERMINAL_ABORTED } from '../contracts/events.ts'

export type StreamFSMState = 'streaming' | StreamTerminalState

export interface StreamFSMContext {
  sawDone: boolean
  sawError: boolean
  creditsExhausted: boolean
  aborted: boolean
  assistantText: string
  errorMessage: string | null
}

export const INITIAL_FSM_CONTEXT: StreamFSMContext = {
  sawDone: false,
  sawError: false,
  creditsExhausted: false,
  aborted: false,
  assistantText: '',
  errorMessage: null,
}

/**
 * Compute the terminal state from accumulated FSM context.
 * This is a pure function — no side effects.
 *
 * Priority order matches CP-24: aborted > complete > error > cut_off > empty
 */
export function resolveTerminalState(ctx: StreamFSMContext): StreamTerminalState {
  if (ctx.aborted) return TERMINAL_ABORTED
  if (ctx.sawDone) return TERMINAL_COMPLETE
  if (ctx.sawError) return STREAM_ERROR
  if (ctx.creditsExhausted || ctx.assistantText) return TERMINAL_CUT_OFF
  return TERMINAL_EMPTY
}

/**
 * Validate that a terminal state transition is legal.
 * Only streaming → terminal is allowed; terminal → terminal is forbidden.
 */
export function canTransition(current: StreamFSMState, target: StreamTerminalState): boolean {
  if (current === 'streaming') return true
  return false // terminal states are final
}

/**
 * Apply a terminal state to the stream registry with exactly-once semantics.
 * Returns true if the terminal was accepted (first transition), false otherwise.
 */
export function finalizeStream(
  registry: StreamRegistry,
  sessionId: string,
  streamId: string,
  terminal: StreamTerminalState,
): boolean {
  return registry.markTerminal(sessionId, streamId, terminal)
}
