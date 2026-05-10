import { describe, test, expect } from 'bun:test'
import {
  nextMigrationState,
  isLegalMigrationTransition,
  isMigrationTerminal,
  isPartialFailureRecoverable,
  type MigrationFSMState,
  type MigrationStage,
} from '../../server/services/migrationService.ts'

describe('migration service', () => {
  describe('nextMigrationState', () => {
    test('pending → running on start', () => {
      expect(nextMigrationState('pending', 'start')).toBe('running')
    })

    test('running → running on stage_advance', () => {
      expect(nextMigrationState('running', 'stage_advance')).toBe('running')
    })

    test('running → completed on success', () => {
      expect(nextMigrationState('running', 'success')).toBe('completed')
    })

    test('running → failed on failure', () => {
      expect(nextMigrationState('running', 'failure')).toBe('failed')
    })

    test('running → partial_failed on partial_failure', () => {
      expect(nextMigrationState('running', 'partial_failure')).toBe('partial_failed')
    })

    test('partial_failed → failed on escalate', () => {
      expect(nextMigrationState('partial_failed', 'escalate')).toBe('failed')
    })

    test('partial_failed → completed on recover', () => {
      expect(nextMigrationState('partial_failed', 'recover')).toBe('completed')
    })

    test('illegal transitions return null', () => {
      expect(nextMigrationState('pending', 'success')).toBeNull()
      expect(nextMigrationState('completed', 'start')).toBeNull()
      expect(nextMigrationState('failed', 'success')).toBeNull()
    })
  })

  describe('isLegalMigrationTransition', () => {
    test('matches nextMigrationState results', () => {
      expect(isLegalMigrationTransition('pending', 'start')).toBe(true)
      expect(isLegalMigrationTransition('running', 'success')).toBe(true)
      expect(isLegalMigrationTransition('pending', 'success')).toBe(false)
    })
  })

  describe('isMigrationTerminal', () => {
    test('completed is terminal', () => {
      expect(isMigrationTerminal('completed')).toBe(true)
    })

    test('failed is terminal', () => {
      expect(isMigrationTerminal('failed')).toBe(true)
    })

    test('running is not terminal', () => {
      expect(isMigrationTerminal('running')).toBe(false)
    })

    test('pending is not terminal', () => {
      expect(isMigrationTerminal('pending')).toBe(false)
    })

    test('partial_failed is not terminal', () => {
      expect(isMigrationTerminal('partial_failed')).toBe(false)
    })
  })

  describe('isPartialFailureRecoverable', () => {
    test('transferring_snapshot is recoverable', () => {
      expect(isPartialFailureRecoverable('transferring_snapshot')).toBe(true)
    })

    test('verifying_target is recoverable', () => {
      expect(isPartialFailureRecoverable('verifying_target')).toBe(true)
    })

    test('finalizing is recoverable', () => {
      expect(isPartialFailureRecoverable('finalizing')).toBe(true)
    })

    test('creating_target is not recoverable', () => {
      expect(isPartialFailureRecoverable('creating_target')).toBe(false)
    })

    test('acquiring_target is not recoverable', () => {
      expect(isPartialFailureRecoverable('acquiring_target')).toBe(false)
    })

    test('pending is not recoverable', () => {
      expect(isPartialFailureRecoverable('pending')).toBe(false)
    })
  })
})
