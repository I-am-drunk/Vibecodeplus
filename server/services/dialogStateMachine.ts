/**
 * Dialog State Machine (CP-30).
 *
 * Validates mutually exclusive dialog lifecycle transitions.
 * A dialog can only be in one state at a time, and transitions
 * must follow legal paths.
 *
 * Dialog types: key_recovery, credits, continuation, backup
 * States: closed → opening → open → submitting → success / error → closed
 */

export type DialogType = 'key_recovery' | 'credits' | 'continuation' | 'backup'
export type DialogState = 'closed' | 'opening' | 'open' | 'submitting' | 'success' | 'error'

interface DialogTransition {
  from: DialogState
  to: DialogState
}

const LEGAL_TRANSITIONS: DialogTransition[] = [
  // Opening a dialog
  { from: 'closed', to: 'opening' },
  { from: 'error', to: 'opening' },
  { from: 'success', to: 'closed' },
  { from: 'success', to: 'opening' },

  // Dialog opened
  { from: 'opening', to: 'open' },
  { from: 'opening', to: 'error' },
  { from: 'opening', to: 'closed' },

  // Submitting
  { from: 'open', to: 'submitting' },
  { from: 'open', to: 'closed' },
  { from: 'error', to: 'open' },

  // Result
  { from: 'submitting', to: 'success' },
  { from: 'submitting', to: 'error' },

  // Closing
  { from: 'error', to: 'closed' },
]

const TRANSITION_MAP = new Set(
  LEGAL_TRANSITIONS.map((t) => `${t.from}->${t.to}`),
)

/**
 * Check if a dialog state transition is legal.
 */
export function isLegalDialogTransition(from: DialogState, to: DialogState): boolean {
  if (from === to) return true // idempotent
  return TRANSITION_MAP.has(`${from}->${to}`)
}

/**
 * Compute the next dialog state for a given transition event.
 * Returns null if the transition is illegal.
 */
export function nextDialogState(
  current: DialogState,
  event: 'open' | 'submit' | 'success' | 'error' | 'close' | 'retry',
): DialogState | null {
  const eventMap: Record<string, [DialogState, DialogState][]> = {
    open: [
      ['closed', 'opening'],
      ['error', 'opening'],
      ['success', 'opening'],
    ],
    submit: [
      ['open', 'submitting'],
    ],
    success: [
      ['submitting', 'success'],
    ],
    error: [
      ['opening', 'error'],
      ['submitting', 'error'],
    ],
    close: [
      ['opening', 'closed'],
      ['open', 'closed'],
      ['error', 'closed'],
      ['success', 'closed'],
    ],
    retry: [
      ['error', 'open'],
    ],
  }

  const transitions = eventMap[event]
  if (!transitions) return null

  const match = transitions.find(([from]) => from === current)
  if (!match) return null

  return match[1]
}

/**
 * Check if a dialog state is terminal (no further transitions expected
 * except close or retry).
 */
export function isDialogTerminal(state: DialogState): boolean {
  return state === 'success' || state === 'error' || state === 'closed'
}

/**
 * Validate that only one dialog of each type is active at a time.
 * Returns the conflicting dialog type if a duplicate is detected,
 * or null if the dialog can be opened.
 */
export function validateDialogExclusivity(
  activeDialogs: Map<DialogType, DialogState>,
  requestedType: DialogType,
): DialogType | null {
  const currentState = activeDialogs.get(requestedType)
  if (currentState && currentState !== 'closed') {
    return requestedType
  }
  return null
}
