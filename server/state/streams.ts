import { createLogger } from '../lib/logger.ts'

const log = createLogger('streams')

export type StreamTerminalState = 'complete' | 'cut_off' | 'empty' | 'error' | 'aborted'

export interface ActiveStream {
  sessionId: string
  projectId: string
  streamId: string
  abortController: AbortController
  startedAt: Date
  sequence: number
  terminalState: StreamTerminalState | null
  abortReason: string | null
}

export class StreamRegistry {
  private bySession = new Map<string, ActiveStream>()
  private byProject = new Map<string, Set<string>>()
  private finalizedStreams = new Map<string, StreamTerminalState>()

  register(sessionId: string, projectId: string, abortController: AbortController): ActiveStream {
    const existing = this.bySession.get(sessionId)
    if (existing) {
      try {
        existing.abortController.abort('replaced stream')
      } catch {
        // ignore
      }
      this.unregister(sessionId, existing.streamId)
    }

    const stream: ActiveStream = {
      sessionId,
      projectId,
      streamId: crypto.randomUUID(),
      abortController,
      startedAt: new Date(),
      sequence: 0,
      terminalState: null,
      abortReason: null,
    }

    this.bySession.set(sessionId, stream)

    if (!this.byProject.has(projectId)) {
      this.byProject.set(projectId, new Set())
    }
    this.byProject.get(projectId)!.add(sessionId)

    log.debug({ sessionId, projectId, streamId: stream.streamId, total: this.bySession.size }, 'stream registered')
    return stream
  }

  unregister(sessionId: string, streamId?: string) {
    const stream = this.bySession.get(sessionId)
    if (!stream) return
    if (streamId && stream.streamId !== streamId) return

    this.bySession.delete(sessionId)

    const projectSet = this.byProject.get(stream.projectId)
    if (projectSet) {
      projectSet.delete(sessionId)
      if (projectSet.size === 0) this.byProject.delete(stream.projectId)
    }

    if (stream.terminalState) {
      this.finalizedStreams.set(stream.streamId, stream.terminalState)
      if (this.finalizedStreams.size > 3000) {
        const first = this.finalizedStreams.keys().next().value
        if (first) this.finalizedStreams.delete(first)
      }
    }

    log.debug({ sessionId, streamId: stream.streamId, total: this.bySession.size }, 'stream unregistered')
  }

  nextSequence(sessionId: string, streamId: string): number | null {
    const stream = this.bySession.get(sessionId)
    if (!stream) return null
    if (stream.streamId !== streamId) return null

    stream.sequence += 1
    return stream.sequence
  }

  markTerminal(sessionId: string, streamId: string, terminalState: StreamTerminalState): boolean {
    const stream = this.bySession.get(sessionId)
    if (!stream || stream.streamId !== streamId) {
      if (this.finalizedStreams.has(streamId)) return false
      return false
    }

    if (stream.terminalState) return false

    stream.terminalState = terminalState
    return true
  }

  requestAbort(sessionId: string, reason = 'aborted'): { accepted: boolean; stream: ActiveStream | null } {
    const stream = this.bySession.get(sessionId)
    if (!stream) return { accepted: false, stream: null }

    stream.abortReason = reason

    try {
      stream.abortController.abort(reason)
    } catch {
      // ignore
    }

    return { accepted: true, stream }
  }

  abort(sessionId: string, reason = 'aborted') {
    const result = this.requestAbort(sessionId, reason)
    return result.accepted
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

  isStreamFinalized(streamId: string): boolean {
    return this.finalizedStreams.has(streamId)
  }
}

export const streamRegistry = new StreamRegistry()
