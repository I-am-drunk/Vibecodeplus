import { createLogger } from '../lib/logger.ts'

const log = createLogger('streams')

export interface ActiveStream {
  sessionId: string
  projectId: string
  abortController: AbortController
  startedAt: Date
}

class StreamRegistry {
  private bySession = new Map<string, ActiveStream>()
  private byProject = new Map<string, Set<string>>()

  register(sessionId: string, projectId: string, abortController: AbortController) {
    const existing = this.bySession.get(sessionId)
    if (existing) {
      try {
        existing.abortController.abort('replaced stream')
      } catch {
        // no-op
      }
      this.unregister(sessionId)
    }

    const stream: ActiveStream = {
      sessionId,
      projectId,
      abortController,
      startedAt: new Date(),
    }

    this.bySession.set(sessionId, stream)

    if (!this.byProject.has(projectId)) {
      this.byProject.set(projectId, new Set())
    }
    this.byProject.get(projectId)!.add(sessionId)

    log.debug({ sessionId, projectId, total: this.bySession.size }, 'stream registered')
  }

  unregister(sessionId: string) {
    const stream = this.bySession.get(sessionId)
    if (!stream) return

    this.bySession.delete(sessionId)

    const projectSet = this.byProject.get(stream.projectId)
    if (projectSet) {
      projectSet.delete(sessionId)
      if (projectSet.size === 0) this.byProject.delete(stream.projectId)
    }

    log.debug({ sessionId, total: this.bySession.size }, 'stream unregistered')
  }

  abort(sessionId: string, reason = 'aborted') {
    const stream = this.bySession.get(sessionId)
    if (!stream) return false

    log.info({ sessionId, projectId: stream.projectId, reason }, 'aborting stream')
    try {
      stream.abortController.abort(reason)
    } finally {
      this.unregister(sessionId)
    }
    return true
  }

  abortProject(projectId: string, reason = 'project abort') {
    const ids = this.byProject.get(projectId)
    if (!ids || ids.size === 0) return 0

    let count = 0
    for (const sessionId of [...ids]) {
      if (this.abort(sessionId, reason)) count += 1
    }

    log.warn({ projectId, count, reason }, 'aborted project streams')
    return count
  }

  abortAll(reason = 'server shutdown') {
    const ids = [...this.bySession.keys()]
    if (ids.length === 0) return

    log.warn({ count: ids.length, reason }, 'aborting all active streams')
    for (const sessionId of ids) {
      this.abort(sessionId, reason)
    }
  }

  has(sessionId: string) {
    return this.bySession.has(sessionId)
  }

  get(sessionId: string) {
    return this.bySession.get(sessionId)
  }

  getActive() {
    return [...this.bySession.values()]
  }
}

export const streamRegistry = new StreamRegistry()
