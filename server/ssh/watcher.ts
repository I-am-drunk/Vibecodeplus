import { sshManager } from './manager.ts'
import { scheduleCapture } from '../continuation/capture.ts'
import { createLogger } from '../lib/logger.ts'
import { featureFlags } from '../lib/flags.ts'

type FileChange = { path: string; action: 'created' | 'modified' | 'deleted' }
type ChangeHandler = (projectId: string, changes: FileChange[]) => void

export type WatcherStatus = 'running' | 'blocked' | 'cooldown' | 'stopped'

type WatcherContext = {
  projectId: string
  state: WatcherStatus
  pollMs: number
  forbiddenFailures: number
  cooldownMs: number
  blockedAt?: number
  interval?: ReturnType<typeof setInterval>
  cooldownTimer?: ReturnType<typeof setTimeout>
  lastError?: string
  lastLoggedSignature?: string
}

const log = createLogger('watcher')
const DEFAULT_POLL_MS = 15_000
const BASE_COOLDOWN_MS = 10_000
const MAX_COOLDOWN_MS = 120_000
const MAX_FORBIDDEN_FAILURES_BEFORE_BLOCK = 4

function isForbiddenError(message: string) {
  const normalized = message.toLowerCase()
  return (
    normalized.includes('forbidden') ||
    normalized.includes('unauthorized') ||
    normalized.includes('authentication') ||
    normalized.includes('permission denied') ||
    normalized.includes('acquiring sandbox failed')
  )
}

function normalizeChangedPath(rawPath: string) {
  return rawPath.replace('/home/user/workspace', '') || '/'
}

export class FileChangeWatcher {
  private contexts = new Map<string, WatcherContext>()
  private handlers = new Set<ChangeHandler>()

  start(projectId: string, pollMs = DEFAULT_POLL_MS, opts?: { resetFailures?: boolean }) {
    const existing = this.contexts.get(projectId)
    const forceReset = !!opts?.resetFailures

    if (existing?.state === 'running' || existing?.state === 'cooldown') {
      return
    }

    if (existing?.state === 'blocked' && !forceReset) {
      if (!sshManager.isConnected(projectId)) {
        return
      }
    }

    const context: WatcherContext = existing ?? {
      projectId,
      state: 'stopped',
      pollMs,
      forbiddenFailures: 0,
      cooldownMs: 0,
    }

    if (forceReset || context.state === 'blocked') {
      context.forbiddenFailures = 0
      context.cooldownMs = 0
      context.blockedAt = undefined
    }

    context.pollMs = pollMs
    context.state = 'running'
    context.lastError = undefined
    context.lastLoggedSignature = undefined

    if (context.cooldownTimer) {
      clearTimeout(context.cooldownTimer)
      context.cooldownTimer = undefined
    }

    if (context.interval) {
      clearInterval(context.interval)
      context.interval = undefined
    }

    if (featureFlags.watcher_fsm_v2) {
      context.interval = setInterval(() => {
        void this.poll(projectId)
      }, pollMs)
    } else {
      context.interval = setInterval(() => {
        void this.legacyPoll(projectId)
      }, pollMs)
    }

    this.contexts.set(projectId, context)
    void sshManager.exec(projectId, 'touch /tmp/.vibecode-check').catch(() => {})
  }

  reset(projectId: string) {
    const context = this.contexts.get(projectId)
    if (!context) return

    context.forbiddenFailures = 0
    context.cooldownMs = 0
    context.blockedAt = undefined
    context.lastError = undefined
    context.lastLoggedSignature = undefined

    if (context.state === 'blocked') {
      context.state = 'stopped'
    }

    this.contexts.set(projectId, context)
  }

  private async poll(projectId: string) {
    const context = this.contexts.get(projectId)
    if (!context || context.state !== 'running') return

    try {
      const output = await sshManager.exec(
        projectId,
        `
          find /home/user/workspace -maxdepth 10 -newer /tmp/.vibecode-check -type f \
            ! -path '*/node_modules/*' ! -path '*/.git/*' -print 2>/dev/null;
          touch /tmp/.vibecode-check
        `,
      )

      const files = output
        .split('\n')
        .map((entry) => entry.trim())
        .filter(Boolean)

      if (files.length === 0) return

      context.forbiddenFailures = 0
      context.cooldownMs = 0
      context.blockedAt = undefined
      context.lastError = undefined

      const changes: FileChange[] = files.map((filePath) => ({
        path: normalizeChangedPath(filePath),
        action: 'modified',
      }))

      for (const handler of this.handlers) {
        handler(projectId, changes)
      }

      scheduleCapture(projectId)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)

      if (isForbiddenError(message)) {
        this.enterBlocked(projectId, message)
        return
      }

      this.logCompact(projectId, `exec:${message}`, {
        projectId,
        message,
      })
    }
  }

  private async legacyPoll(projectId: string) {
    const context = this.contexts.get(projectId)
    if (!context || context.state !== 'running') return

    try {
      const output = await sshManager.exec(
        projectId,
        `
          find /home/user/workspace -maxdepth 10 -newer /tmp/.vibecode-check -type f \
            ! -path '*/node_modules/*' ! -path '*/.git/*' -print 2>/dev/null;
          touch /tmp/.vibecode-check
        `,
      )

      const files = output
        .split('\n')
        .map((entry) => entry.trim())
        .filter(Boolean)

      if (!files.length) return

      const changes: FileChange[] = files.map((filePath) => ({
        path: normalizeChangedPath(filePath),
        action: 'modified',
      }))

      for (const handler of this.handlers) {
        handler(projectId, changes)
      }

      scheduleCapture(projectId)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (isForbiddenError(message)) {
        this.stop(projectId)
      }
    }
  }

  private enterBlocked(projectId: string, message: string) {
    const context = this.contexts.get(projectId)
    if (!context) return

    if (context.interval) {
      clearInterval(context.interval)
      context.interval = undefined
    }

    context.forbiddenFailures += 1
    context.lastError = message

    if (context.forbiddenFailures >= MAX_FORBIDDEN_FAILURES_BEFORE_BLOCK) {
      context.state = 'blocked'
      context.cooldownMs = 0
      context.blockedAt = Date.now()

      if (context.cooldownTimer) {
        clearTimeout(context.cooldownTimer)
        context.cooldownTimer = undefined
      }

      this.logCompact(projectId, `blocked:hard:${context.forbiddenFailures}:${message}`, {
        projectId,
        failures: context.forbiddenFailures,
      })
      return
    }

    const cooldownMs = Math.min(BASE_COOLDOWN_MS * 2 ** (context.forbiddenFailures - 1), MAX_COOLDOWN_MS)
    context.cooldownMs = cooldownMs
    context.state = 'cooldown'

    this.logCompact(projectId, `blocked:${context.forbiddenFailures}:${message}`, {
      projectId,
      failures: context.forbiddenFailures,
      cooldownMs,
    })

    if (context.cooldownTimer) {
      clearTimeout(context.cooldownTimer)
    }

    context.cooldownTimer = setTimeout(() => {
      const latest = this.contexts.get(projectId)
      if (!latest || latest.state !== 'cooldown') return
      latest.cooldownTimer = undefined
      latest.state = 'stopped'
      this.start(projectId, latest.pollMs)
    }, cooldownMs)
  }

  private logCompact(projectId: string, signature: string, payload: Record<string, unknown>) {
    const context = this.contexts.get(projectId)
    if (!context) return

    if (context.lastLoggedSignature === signature) return
    context.lastLoggedSignature = signature

    if (signature.startsWith('blocked:hard')) {
      log.warn(payload, 'watcher blocked after repeated forbidden/auth failures')
      return
    }

    if (signature.startsWith('blocked')) {
      log.warn(payload, 'watcher entered cooldown after forbidden/auth failure')
      return
    }

    log.warn(payload, 'watcher poll failed')
  }

  remapProject(sourceProjectId: string, targetProjectId: string) {
    const source = this.contexts.get(sourceProjectId)
    const shouldStartTarget = !!source && (source.state === 'running' || source.state === 'cooldown')
    const pollMs = source?.pollMs ?? DEFAULT_POLL_MS

    this.stop(targetProjectId)
    this.stop(sourceProjectId)

    if (shouldStartTarget) {
      this.start(targetProjectId, pollMs, { resetFailures: true })
      log.info({ sourceProjectId, targetProjectId }, 'watcher remapped to migrated project')
    }
  }

  stop(projectId?: string) {
    if (projectId) {
      const context = this.contexts.get(projectId)
      if (!context) return

      if (context.interval) {
        clearInterval(context.interval)
        context.interval = undefined
      }

      if (context.cooldownTimer) {
        clearTimeout(context.cooldownTimer)
        context.cooldownTimer = undefined
      }

      context.state = 'stopped'
      this.contexts.set(projectId, context)
      return
    }

    for (const [id] of this.contexts) {
      this.stop(id)
    }
  }

  onChange(handler: ChangeHandler) {
    this.handlers.add(handler)
    return () => {
      this.handlers.delete(handler)
    }
  }

  getState(projectId: string) {
    const context = this.contexts.get(projectId)
    if (!context) {
      return {
        state: 'stopped' as WatcherStatus,
        forbiddenFailures: 0,
        cooldownMs: 0,
        pollMs: DEFAULT_POLL_MS,
        blockedAt: null as number | null,
      }
    }

    return {
      state: context.state,
      forbiddenFailures: context.forbiddenFailures,
      cooldownMs: context.cooldownMs,
      pollMs: context.pollMs,
      blockedAt: context.blockedAt ?? null,
      lastError: context.lastError,
    }
  }
}

export const fileWatcher = new FileChangeWatcher()
