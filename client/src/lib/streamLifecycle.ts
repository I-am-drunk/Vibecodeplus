export type StreamTerminal = 'complete' | 'cut_off' | 'empty' | 'error' | 'aborted'

type SessionStream = {
  streamId: string
  lastSequence: number
  terminal: StreamTerminal | null
}

export type StreamAcceptResult = {
  accepted: boolean
  reason?: 'missing' | 'stream_mismatch' | 'duplicate_sequence' | 'out_of_order' | 'already_terminal'
}

export function createStreamLifecycleGuard() {
  const sessions = new Map<string, SessionStream>()

  function start(sessionId: string, streamId: string, sequence = 0): StreamAcceptResult {
    const previous = sessions.get(sessionId)
    if (previous && previous.streamId === streamId) {
      if (sequence <= previous.lastSequence) {
        return { accepted: false, reason: 'duplicate_sequence' }
      }
    }

    sessions.set(sessionId, {
      streamId,
      lastSequence: sequence,
      terminal: null,
    })

    return { accepted: true }
  }

  function acceptEvent(sessionId: string, streamId: string, sequence: number): StreamAcceptResult {
    const stream = sessions.get(sessionId)
    if (!stream) return { accepted: false, reason: 'missing' }
    if (stream.streamId !== streamId) return { accepted: false, reason: 'stream_mismatch' }
    if (stream.terminal) return { accepted: false, reason: 'already_terminal' }
    if (sequence === stream.lastSequence) return { accepted: false, reason: 'duplicate_sequence' }
    if (sequence < stream.lastSequence) return { accepted: false, reason: 'out_of_order' }

    stream.lastSequence = sequence
    return { accepted: true }
  }

  function acceptTerminal(sessionId: string, streamId: string, sequence: number, terminal: StreamTerminal): StreamAcceptResult {
    const stream = sessions.get(sessionId)
    if (!stream) return { accepted: false, reason: 'missing' }
    if (stream.streamId !== streamId) return { accepted: false, reason: 'stream_mismatch' }
    if (stream.terminal) return { accepted: false, reason: 'already_terminal' }
    if (sequence < stream.lastSequence) return { accepted: false, reason: 'out_of_order' }

    stream.lastSequence = sequence
    stream.terminal = terminal
    return { accepted: true }
  }

  function clearSession(sessionId: string) {
    sessions.delete(sessionId)
  }

  function getSession(sessionId: string) {
    return sessions.get(sessionId)
  }

  return {
    start,
    acceptEvent,
    acceptTerminal,
    clearSession,
    getSession,
  }
}
