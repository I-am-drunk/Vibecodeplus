import { createLogger } from '../lib/logger.ts'

const log = createLogger('streams')

interface ActiveStream {
  sessionId: string
  projectId: string
  abort: AbortController
  startedAt: Date
}

class StreamRegistry {
  private streams = new Map<string, ActiveStream>()

  register(sessionId: string, projectId: string, abort: AbortController) {
    this.streams.set(sessionId, { sessionId, projectId, abort, startedAt: new Date() })
    log.debug({ sessionId, projectId, total: this.streams.size }, 'stream registered')
  }

  unregister(sessionId: string) {
    this.streams.delete(sessionId)
    log.debug({ sessionId, total: this.streams.size }, 'stream unregistered')
  }

  abort(sessionId: string, reason = 'aborted') {
    const stream = this.streams.get(sessionId)
    if (!stream) return false
    log.info({ sessionId, reason }, 'aborting stream')
    stream.abort.abort(reason)
    this.streams.delete(sessionId)
    return true
  }

  abortAll(reason = 'server shutdown') {
    const count = this.streams.size
    if (count === 0) return
    log.warn({ count, reason }, 'aborting all active streams')
    for (const [sessionId, stream] of this.streams) {
      log.info({ sessionId, projectId: stream.projectId, reason }, 'auto-stopping stream')
      stream.abort.abort(reason)
    }
    this.streams.clear()
  }

  getActive() {
    return [...this.streams.values()]
  }
}

export const streamRegistry = new StreamRegistry()
