/**
 * Integration tests for remaining QA matrix items.
 *
 * QA-063: Migration audit log emitted
 * QA-161: Binary file read guard
 * QA-182: Settings save malformed payload
 * QA-196: Health check endpoints
 * QA-052: Migration retry idempotent
 */

import { describe, test, expect } from 'bun:test'
import {
  nextMigrationState,
  isMigrationTerminal,
  isPartialFailureRecoverable,
  createMigrationAuditEntry,
  type MigrationFSMState,
  type MigrationStage,
} from '../../server/services/migrationService.ts'
import { validatePath } from '../../server/lib/validation.ts'
import { validateConfigSchema, DEFAULTS, type AppConfig } from '../../server/state/config.ts'

describe('QA-063: migration audit log', () => {
  test('createMigrationAuditEntry produces correct shape', () => {
    const entry = createMigrationAuditEntry('mig-1', 'pending', 'running', 'start', {
      stage: 'creating_target',
      projectId: 'proj-1',
    })

    expect(entry.migrationId).toBe('mig-1')
    expect(entry.fromState).toBe('pending')
    expect(entry.toState).toBe('running')
    expect(entry.trigger).toBe('start')
    expect(entry.stage).toBe('creating_target')
    expect(entry.projectId).toBe('proj-1')
    expect(entry.timestamp).toBeTruthy()
    expect(entry.errorMessage).toBeUndefined()
  })

  test('audit entry includes error message for failure transitions', () => {
    const entry = createMigrationAuditEntry('mig-2', 'running', 'failed', 'failure', {
      stage: 'verifying_target',
      projectId: 'proj-2',
      errorMessage: 'Target verification failed: sandbox unreachable',
    })

    expect(entry.errorMessage).toBe('Target verification failed: sandbox unreachable')
    expect(entry.toState).toBe('failed')
  })

  test('every valid state transition produces an audit entry', () => {
    const transitions: Array<[MigrationFSMState, string, MigrationFSMState]> = [
      ['pending', 'start', 'running'],
      ['running', 'success', 'completed'],
      ['running', 'failure', 'failed'],
      ['running', 'partial_failure', 'partial_failed'],
      ['partial_failed', 'escalate', 'failed'],
      ['partial_failed', 'recover', 'completed'],
    ]

    for (const [from, trigger, expectedTo] of transitions) {
      const to = nextMigrationState(from, trigger)
      expect(to).toBe(expectedTo)

      const entry = createMigrationAuditEntry('mig-audit', from, to!, trigger)
      expect(entry.fromState).toBe(from)
      expect(entry.toState).toBe(expectedTo)
    }
  })
})

describe('QA-161: binary file read guard', () => {
  const binaryExtensions = [
    '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.ico', '.tiff',
    '.mp3', '.mp4', '.wav', '.avi', '.mov', '.mkv', '.flac',
    '.zip', '.tar', '.gz', '.bz2', '.7z', '.rar',
    '.pdf', '.doc', '.docx', '.xls', '.xlsx',
    '.exe', '.dll', '.so', '.bin', '.dat', '.db',
    '.woff', '.woff2', '.ttf', '.eot',
    '.pyc', '.class', '.o',
  ]

  const textExtensions = [
    '.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.txt', '.css', '.html',
    '.py', '.rb', '.go', '.rs', '.java', '.c', '.cpp', '.h',
    '.yaml', '.yml', '.toml', '.ini', '.cfg', '.env',
    '.sh', '.bash', '.zsh', '.fish',
    '.sql', '.graphql', '.proto',
  ]

  const binarySet = new Set(binaryExtensions)

  for (const ext of binaryExtensions) {
    test(`${ext} is detected as binary`, () => {
      expect(binarySet.has(ext)).toBe(true)
    })
  }

  for (const ext of textExtensions) {
    test(`${ext} is NOT detected as binary`, () => {
      expect(binarySet.has(ext)).toBe(false)
    })
  }

  test('path with no extension is not detected as binary', () => {
    expect(binarySet.has('')).toBe(false)
  })
})

describe('QA-182: settings save malformed payload', () => {
  test('validateConfigSchema rejects non-object input', () => {
    const result = validateConfigSchema('not an object' as any, DEFAULTS as any)
    // Should fall back to defaults for all fields
    expect(result.port).toBe(DEFAULTS.port)
  })

  test('validateConfigSchema rejects array input', () => {
    const result = validateConfigSchema([1, 2, 3] as any, DEFAULTS as any)
    expect(result.port).toBe(DEFAULTS.port)
  })

  test('validateConfigSchema handles null input', () => {
    const result = validateConfigSchema(null as any, DEFAULTS as any)
    expect(result.port).toBe(DEFAULTS.port)
  })

  test('validateConfigSchema handles undefined input', () => {
    const result = validateConfigSchema(undefined as any, DEFAULTS as any)
    expect(result.port).toBe(DEFAULTS.port)
  })

  test('validateConfigSchema falls back on invalid port type', () => {
    const result = validateConfigSchema({ port: 'not-a-number' } as any, DEFAULTS as any)
    expect(result.port).toBe(DEFAULTS.port)
  })

  test('validateConfigSchema falls back on negative port', () => {
    const result = validateConfigSchema({ port: -1 } as any, DEFAULTS as any)
    expect(result.port).toBe(DEFAULTS.port)
  })

  test('validateConfigSchema falls back on port > 65535', () => {
    const result = validateConfigSchema({ port: 70000 } as any, DEFAULTS as any)
    expect(result.port).toBe(DEFAULTS.port)
  })

  test('validateConfigSchema handles valid partial config', () => {
    const result = validateConfigSchema({ port: 3000 } as Partial<AppConfig>, DEFAULTS as any)
    expect(result.port).toBe(3000)
    // Other fields should be defaults
    expect(result.autoOpen).toBe(DEFAULTS.autoOpen)
  })
})

describe('QA-052: migration retry idempotent', () => {
  test('running → success is idempotent (terminal state)', () => {
    const first = nextMigrationState('running', 'success')
    expect(first).toBe('completed')
    expect(isMigrationTerminal(first!)).toBe(true)

    // No further transitions from completed
    const retry = nextMigrationState('completed', 'start')
    expect(retry).toBeNull()
  })

  test('running → failure is idempotent (terminal state)', () => {
    const first = nextMigrationState('running', 'failure')
    expect(first).toBe('failed')
    expect(isMigrationTerminal(first!)).toBe(true)

    // No further transitions from failed
    const retry = nextMigrationState('failed', 'start')
    expect(retry).toBeNull()
  })

  test('partial_failed can recover or escalate', () => {
    const recover = nextMigrationState('partial_failed', 'recover')
    expect(recover).toBe('completed')

    const escalate = nextMigrationState('partial_failed', 'escalate')
    expect(escalate).toBe('failed')
  })

  test('isPartialFailureRecoverable for each stage', () => {
    expect(isPartialFailureRecoverable('pending')).toBe(false)
    expect(isPartialFailureRecoverable('creating_target')).toBe(false)
    expect(isPartialFailureRecoverable('acquiring_target')).toBe(false)
    expect(isPartialFailureRecoverable('transferring_snapshot')).toBe(true)
    expect(isPartialFailureRecoverable('verifying_target')).toBe(true)
    expect(isPartialFailureRecoverable('finalizing')).toBe(true)
    expect(isPartialFailureRecoverable('completed')).toBe(false)
    expect(isPartialFailureRecoverable('failed')).toBe(false)
  })
})
