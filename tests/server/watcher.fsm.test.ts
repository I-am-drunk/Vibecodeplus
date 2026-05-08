import { describe, expect, test } from 'bun:test'
import { fileWatcher } from '../../server/ssh/watcher.ts'
import { sshManager } from '../../server/ssh/manager.ts'

describe('watcher forbidden/backoff containment', () => {
  test('watcher enters blocked/cooldown under repeated auth failures', async () => {
    const originalExec = sshManager.exec.bind(sshManager)

    ;(sshManager as any).exec = async () => {
      throw new Error('Forbidden: invalid authentication token')
    }

    try {
      fileWatcher.start('project-auth-fail', 20)
      await Bun.sleep(120)

      const state = fileWatcher.getState('project-auth-fail')
      expect(['blocked', 'cooldown', 'running']).toContain(state.state)
      expect(state.forbiddenFailures).toBeGreaterThan(0)
      expect(state.cooldownMs).toBeGreaterThanOrEqual(0)
      expect(state.cooldownMs).toBeLessThanOrEqual(120000)
    } finally {
      fileWatcher.stop('project-auth-fail')
      ;(sshManager as any).exec = originalExec
    }
  })
})
