/**
 * Migration Service (CP-11..CP-16).
 *
 * Formalizes the migration FSM transitions:
 *   pending → running → (stage transitions) → completed | failed | partial_failed
 *
 * Extracted from continuation/orchestrator.ts for testability in isolation.
 */

export type MigrationFSMState = 'pending' | 'running' | 'completed' | 'failed' | 'partial_failed'

export type MigrationStage =
  | 'pending'
  | 'creating_target'
  | 'acquiring_target'
  | 'transferring_snapshot'
  | 'verifying_target'
  | 'finalizing'
  | 'completed'
  | 'failed'

export interface MigrationFSMTransition {
  from: MigrationFSMState
  to: MigrationFSMState
  trigger: string
}

/**
 * Legal state transitions for the migration FSM.
 * Each entry is [from, to, triggerName].
 */
export const MIGRATION_TRANSITIONS: ReadonlyArray<[MigrationFSMState, MigrationFSMState, string]> = [
  ['pending', 'running', 'start'],
  ['running', 'running', 'stage_advance'],
  ['running', 'completed', 'success'],
  ['running', 'failed', 'failure'],
  ['running', 'partial_failed', 'partial_failure'],
  ['partial_failed', 'failed', 'escalate'],
  ['partial_failed', 'completed', 'recover'],
]

const transitionMap = new Map<string, MigrationFSMState>()
for (const [from, to, trigger] of MIGRATION_TRANSITIONS) {
  transitionMap.set(`${from}:${trigger}`, to)
}

/**
 * Compute the next state given current state and trigger.
 * Returns null if the transition is illegal.
 */
export function nextMigrationState(current: MigrationFSMState, trigger: string): MigrationFSMState | null {
  return transitionMap.get(`${current}:${trigger}`) ?? null
}

/**
 * Check if a transition is legal.
 */
export function isLegalMigrationTransition(current: MigrationFSMState, trigger: string): boolean {
  return transitionMap.has(`${current}:${trigger}`)
}

/**
 * Check if a migration state is terminal (no further transitions possible).
 */
export function isMigrationTerminal(state: MigrationFSMState): boolean {
  return state === 'completed' || state === 'failed'
}

/**
 * Determine if a partial failure is recoverable based on stage.
 * Stages before 'transferring_snapshot' are considered non-recoverable
 * because no data has been transferred yet.
 */
export function isPartialFailureRecoverable(stage: MigrationStage): boolean {
  return stage === 'transferring_snapshot' || stage === 'verifying_target' || stage === 'finalizing'
}

export interface MigrationAuditEntry {
  migrationId: string
  fromState: MigrationFSMState
  toState: MigrationFSMState
  trigger: string
  stage?: MigrationStage
  timestamp: string
  projectId?: string
  errorMessage?: string
}

/**
 * Create a migration audit entry for a state transition.
 * QA-063: Every migration state change must produce an audit log entry.
 */
export function createMigrationAuditEntry(
  migrationId: string,
  fromState: MigrationFSMState,
  toState: MigrationFSMState,
  trigger: string,
  opts?: { stage?: MigrationStage; projectId?: string; errorMessage?: string },
): MigrationAuditEntry {
  return {
    migrationId,
    fromState,
    toState,
    trigger,
    stage: opts?.stage,
    timestamp: new Date().toISOString(),
    projectId: opts?.projectId,
    errorMessage: opts?.errorMessage,
  }
}
