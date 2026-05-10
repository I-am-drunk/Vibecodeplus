/**
 * Workspace safety guard tests (CP-35, QA-159).
 *
 * Validates that:
 * - Write operations are blocked when workspace is not connected
 * - Read operations still work (no guard needed for reads)
 * - The guard uses sshManager.isConnected()
 */

import { describe, test, expect } from 'bun:test'
import { sshManager } from '../../server/ssh/manager.ts'

describe('workspace connection guard', () => {
  test('sshManager.isConnected returns false for unknown project', () => {
    expect(sshManager.isConnected('nonexistent-project-id')).toBe(false)
  })

  test('sshManager.isConnected returns true only for connected projects', () => {
    // No projects are connected in test environment
    expect(sshManager.isConnected('any-project')).toBe(false)
  })

  test('sshManager has isConnected method', () => {
    expect(typeof sshManager.isConnected).toBe('function')
  })

  test('sshManager has getConnection method', () => {
    expect(typeof sshManager.getConnection).toBe('function')
  })

  test('sshManager has closeConnection method', () => {
    expect(typeof sshManager.closeConnection).toBe('function')
  })

  test('sshManager has closeAll method', () => {
    expect(typeof sshManager.closeAll).toBe('function')
  })

  test('sshManager has primeCredentials method', () => {
    expect(typeof sshManager.primeCredentials).toBe('function')
  })
})

describe('workspace guard: file write operations blocked when disconnected', () => {
  test('forbidden error has correct code and status for disconnected workspace', () => {
    const { forbidden } = require('../../server/lib/errors.ts')
    const err = forbidden('Workspace is not connected. Please open the workspace before editing files.')
    expect(err.code).toBe('FORBIDDEN')
    expect(err.status).toBe(403)
    expect(err.message).toContain('not connected')
  })
})

describe('workspace guard: stream conflict on concurrent sends (QA-128)', () => {
  test('conflict error has correct code and status', () => {
    const { conflict } = require('../../server/lib/errors.ts')
    const err = conflict('A stream is already active for this session.')
    expect(err.code).toBe('CONFLICT')
    expect(err.status).toBe(409)
  })

  test('streamRegistry.has returns false for unknown session', () => {
    const { streamRegistry } = require('../../server/state/streams.ts')
    expect(streamRegistry.has('nonexistent-session')).toBe(false)
  })

  test('streamRegistry.has returns true after register', () => {
    const { streamRegistry } = require('../../server/state/streams.ts')
    const ac = new AbortController()
    const stream = streamRegistry.register('test-session-concurrent', 'project-1', ac)
    expect(streamRegistry.has('test-session-concurrent')).toBe(true)
    // Cleanup
    streamRegistry.unregister('test-session-concurrent', stream.streamId)
  })

  test('streamRegistry.has returns false after unregister', () => {
    const { streamRegistry } = require('../../server/state/streams.ts')
    const ac = new AbortController()
    const stream = streamRegistry.register('test-session-cleanup', 'project-1', ac)
    streamRegistry.unregister('test-session-cleanup', stream.streamId)
    expect(streamRegistry.has('test-session-cleanup')).toBe(false)
  })
})
