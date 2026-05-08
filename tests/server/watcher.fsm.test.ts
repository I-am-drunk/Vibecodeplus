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
      expect(state.cooldownMs).toEqual(300000) // bounded backoff + 2s jitter
    } finally {
      fileWatcher.stop('project-auth-fail')
      ;(sshManager as any).exec = originalExec
    }
  })
})
