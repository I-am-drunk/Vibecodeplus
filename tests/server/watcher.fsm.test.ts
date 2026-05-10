import { describe, expect, test } from 'bun:test'
import { fileWatcher } from '../../server/ssh/watcher.ts'
import { sshManager } from '../../server/ssh/manager.ts'

describe('watcher forbidden/backoff containment', () => {
  test('watcher enters blocked_forbidden/cooldown under repeated auth failures (quarantine)', async () => {
    const originalExec = sshManager.exec.bind(sshManager)

    ;(sshManager as any).exec = async () => {
      throw new Error('Forbidden: invalid authentication token')
    }

    try {
      fileWatcher.start('project-auth-fail', 20)
      await Bun.sleep(120)

      const state = fileWatcher.getState('project-auth-fail')
      expect(['blocked_forbidden', 'cooldown', 'running']).toContain(state.state)
      expect(state.forbiddenFailures).toBeGreaterThan(0)
      expect(state.cooldownMs).toBeGreaterThan(0)
    } finally {
      fileWatcher.stop('project-auth-fail')
      ;(sshManager as any).exec = originalExec
    }
  })

  test('exponential backoff: first failure uses BASE_COOLDOWN, not MAX', async () => {
    const originalExec = sshManager.exec.bind(sshManager)

    ;(sshManager as any).exec = async () => {
      throw new Error('Forbidden: invalid authentication token')
    }

    try {
      fileWatcher.start('project-backoff', 20)
      await Bun.sleep(120)

      const state = fileWatcher.getState('project-backoff')
      // First failure: BASE_COOLDOWN_MS (10s) * 2^0 = 10s + up to 2s jitter = 10-12s range
      // Should NOT be 300s (MAX_COOLDOWN_MS) on first failure
      expect(state.cooldownMs).toBeLessThanOrEqual(15000)
      expect(state.cooldownMs).toBeGreaterThanOrEqual(10000)
    } finally {
      fileWatcher.stop('project-backoff')
      ;(sshManager as any).exec = originalExec
    }
  })
})
