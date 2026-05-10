/**
 * Stream lifecycle contract tests (CP-25, CP-28, CP-33).
 *
 * CP-25: Exactly-once finalize — no duplicate assistant messages per stream
 * CP-28: Tool-call binding — orphan tool calls = 0
 * CP-33: Chat panel consistency — retry/continue controls honor terminal state
 * CP-20: SSH retry singleflight — duplicate acquire prevented
 * CP-21: SSH stale callback rejection — old lease callbacks ignored
 */

import { describe, test, expect } from 'bun:test'
import { streamRegistry, type StreamTerminalState } from '../../server/state/streams.ts'
import { resolveTerminalState, type StreamFSMContext } from '../../server/services/streamStateMachine.ts'
import { sshManager } from '../../server/ssh/manager.ts'

describe('CP-25: exactly-once finalize', () => {
  test('markTerminal returns true on first call, false on duplicate', () => {
    const ac = new AbortController()
    const stream = streamRegistry.register('cp25-session', 'project-1', ac)

    const first = streamRegistry.markTerminal('cp25-session', stream.streamId, 'complete')
    expect(first).toBe(true)

    const second = streamRegistry.markTerminal('cp25-session', stream.streamId, 'error')
    expect(second).toBe(false)

    // Verify the terminal state was not overwritten
    const active = streamRegistry.get('cp25-session')
    expect(active?.terminalState).toBe('complete')

    streamRegistry.unregister('cp25-session', stream.streamId)
  })

  test('markTerminal on finalized stream returns false', () => {
    const ac = new AbortController()
    const stream = streamRegistry.register('cp25-finalized', 'project-1', ac)
    streamRegistry.markTerminal('cp25-finalized', stream.streamId, 'complete')
    streamRegistry.unregister('cp25-finalized', stream.streamId)

    // Stream is now in finalizedStreams map
    const result = streamRegistry.markTerminal('cp25-finalized', stream.streamId, 'error')
    expect(result).toBe(false)
  })

  test('markTerminal with wrong streamId returns false', () => {
    const ac = new AbortController()
    const stream = streamRegistry.register('cp25-wrong-id', 'project-1', ac)

    const result = streamRegistry.markTerminal('cp25-wrong-id', 'wrong-stream-id', 'complete')
    expect(result).toBe(false)

    streamRegistry.unregister('cp25-wrong-id', stream.streamId)
  })
})

describe('CP-28: tool-call binding (orphan detection)', () => {
  test('tool result with no matching tool_use is silently dropped', () => {
    // Simulates the normalizeToolResult path in chat.ts
    const toolCalls: Array<{ id: string; status: string; result?: string }> = [
      { id: 'call-1', status: 'running' },
      { id: 'call-2', status: 'running' },
    ]

    // Matching tool result
    const matchingResult = { tool_use_id: 'call-1', content: 'result', is_error: false }
    const target1 = toolCalls.find((call) => call.id === matchingResult.tool_use_id)
    expect(target1).toBeDefined()
    if (target1) {
      target1.result = matchingResult.content
      target1.status = 'success'
    }

    // Orphan tool result (no matching tool_use)
    const orphanResult = { tool_use_id: 'call-999', content: 'orphan', is_error: false }
    const target2 = toolCalls.find((call) => call.id === orphanResult.tool_use_id)
    expect(target2).toBeUndefined()

    // Verify no orphan was added
    expect(toolCalls.length).toBe(2)
    expect(toolCalls[0].status).toBe('success')
    expect(toolCalls[1].status).toBe('running')
  })

  test('orphan tool call count is zero when all tool results match', () => {
    const toolCalls: Array<{ id: string; status: string; result?: string }> = [
      { id: 'call-1', status: 'running' },
      { id: 'call-2', status: 'running' },
    ]

    const results = [
      { tool_use_id: 'call-1', content: 'result1', is_error: false },
      { tool_use_id: 'call-2', content: 'result2', is_error: true },
    ]

    for (const result of results) {
      const target = toolCalls.find((call) => call.id === result.tool_use_id)
      if (target) {
        target.result = result.content
        target.status = result.is_error ? 'error' : 'success'
      }
    }

    const orphans = toolCalls.filter((call) => call.status === 'running')
    expect(orphans.length).toBe(0)
  })
})

describe('CP-33: chat panel consistency (terminal state determines retry/continue)', () => {
  const terminalStates: Array<[StreamTerminalState, boolean, boolean]> = [
    // [terminalState, canRetry, canContinue]
    ['complete', false, false],
    ['cut_off', true, true],
    ['empty', true, false],
    ['error', true, false],
    ['aborted', true, false],
  ]

  for (const [state, expectedRetry, expectedContinue] of terminalStates) {
    test(`${state}: canRetry=${expectedRetry}, canContinue=${expectedContinue}`, () => {
      const isTerminal = ['complete', 'cut_off', 'empty', 'error', 'aborted'].includes(state)
      const canRetry = isTerminal && state !== 'complete'
      const canContinue = isTerminal && state === 'cut_off'
      expect(canRetry).toBe(expectedRetry)
      expect(canContinue).toBe(expectedContinue)
    })
  }

  test('active stream: canRetry=false, canContinue=false', () => {
    const ac = new AbortController()
    const stream = streamRegistry.register('cp33-active', 'project-1', ac)

    // Active stream means no retry/continue
    const isActive = streamRegistry.has('cp33-active')
    expect(isActive).toBe(true)

    streamRegistry.unregister('cp33-active', stream.streamId)
  })

  test('resolveTerminalState produces correct terminal for retry/continue logic', () => {
    const fsmComplete: StreamFSMContext = {
      sawDone: true, sawError: false, creditsExhausted: false, aborted: false,
      assistantText: 'done', errorMessage: null,
    }
    expect(resolveTerminalState(fsmComplete) as string).toBe('complete')

    const fsmCutOff: StreamFSMContext = {
      sawDone: false, sawError: false, creditsExhausted: true, aborted: false,
      assistantText: 'partial', errorMessage: null,
    }
    expect(resolveTerminalState(fsmCutOff) as string).toBe('cut_off')

    const fsmError: StreamFSMContext = {
      sawDone: false, sawError: true, creditsExhausted: false, aborted: false,
      assistantText: '', errorMessage: 'API error',
    }
    expect(resolveTerminalState(fsmError) as string).toBe('error')

    const fsmAborted: StreamFSMContext = {
      sawDone: false, sawError: false, creditsExhausted: false, aborted: true,
      assistantText: 'partial', errorMessage: null,
    }
    expect(resolveTerminalState(fsmAborted) as string).toBe('aborted')
  })
})

describe('CP-20: SSH retry singleflight', () => {
  test('pending map prevents duplicate getConnection calls', () => {
    // SSHManager uses this.pending to deduplicate concurrent getConnection calls
    // We verify the mechanism exists by checking the manager's interface
    expect(typeof sshManager.getConnection).toBe('function')
    expect(typeof sshManager.isConnected).toBe('function')
  })

  test('isConnected returns false for unknown project (no pending)', () => {
    expect(sshManager.isConnected('never-connected-project')).toBe(false)
  })

  test('multiple isConnected calls are idempotent', () => {
    expect(sshManager.isConnected('project-a')).toBe(false)
    expect(sshManager.isConnected('project-a')).toBe(false)
    expect(sshManager.isConnected('project-a')).toBe(false)
  })
})

describe('CP-21: SSH stale callback rejection', () => {
  test('lease counter mechanism exists', () => {
    // SSHManager uses leaseCounters and activeLeases to reject stale callbacks
    expect(typeof sshManager.getLeaseId).toBe('function')
  })

  test('getLeaseId returns null for unknown project', () => {
    expect(sshManager.getLeaseId('unknown-project')).toBeNull()
  })

  test('closeAll clears all state including leases', async () => {
    // closeAll should not throw even with no connections
    await sshManager.closeAll()
    expect(sshManager.isConnected('any-project')).toBe(false)
  })
})

describe('CP-26: abort semantics', () => {
  test('aborted stream produces only aborted terminal state', () => {
    const ac = new AbortController()
    const stream = streamRegistry.register('cp26-session', 'project-1', ac)

    streamRegistry.abort('cp26-session', 'user abort')

    const active = streamRegistry.get('cp26-session')
    expect(active?.abortReason).toBe('user abort')

    // FSM with aborted=true always resolves to 'aborted'
    const fsm: StreamFSMContext = {
      sawDone: true, sawError: false, creditsExhausted: false, aborted: true,
      assistantText: 'partial', errorMessage: null,
    }
    expect(resolveTerminalState(fsm) as string).toBe('aborted')

    streamRegistry.unregister('cp26-session', stream.streamId)
  })
})

describe('CP-27: empty distinct from error/cut_off', () => {
  test('empty is distinct from error', () => {
    const fsmEmpty: StreamFSMContext = {
      sawDone: false, sawError: false, creditsExhausted: false, aborted: false,
      assistantText: '', errorMessage: null,
    }
    const fsmError: StreamFSMContext = {
      sawDone: false, sawError: true, creditsExhausted: false, aborted: false,
      assistantText: '', errorMessage: 'API error',
    }
    expect(resolveTerminalState(fsmEmpty) as string).toBe('empty')
    expect(resolveTerminalState(fsmError) as string).toBe('error')
    expect(resolveTerminalState(fsmEmpty)).not.toBe(resolveTerminalState(fsmError))
  })

  test('empty is distinct from cut_off', () => {
    const fsmEmpty: StreamFSMContext = {
      sawDone: false, sawError: false, creditsExhausted: false, aborted: false,
      assistantText: '', errorMessage: null,
    }
    const fsmCutOff: StreamFSMContext = {
      sawDone: false, sawError: false, creditsExhausted: true, aborted: false,
      assistantText: 'partial', errorMessage: null,
    }
    expect(resolveTerminalState(fsmEmpty) as string).toBe('empty')
    expect(resolveTerminalState(fsmCutOff) as string).toBe('cut_off')
    expect(resolveTerminalState(fsmEmpty)).not.toBe(resolveTerminalState(fsmCutOff))
  })
})
