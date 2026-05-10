import { describe, test, expect } from 'bun:test'
import {
  resolveTerminalState,
  canTransition,
  INITIAL_FSM_CONTEXT,
  type StreamFSMContext,
} from '../../server/services/streamStateMachine.ts'

describe('stream state machine', () => {
  describe('resolveTerminalState', () => {
    test('aborted takes highest priority', () => {
      const ctx: StreamFSMContext = {
        ...INITIAL_FSM_CONTEXT,
        aborted: true,
        sawDone: true,
        sawError: true,
        creditsExhausted: true,
        assistantText: 'some text',
      }
      expect(resolveTerminalState(ctx)).toBe('aborted')
    })

    test('complete when sawDone and not aborted', () => {
      const ctx: StreamFSMContext = { ...INITIAL_FSM_CONTEXT, sawDone: true }
      expect(resolveTerminalState(ctx)).toBe('complete')
    })

    test('error when sawError and not aborted/done', () => {
      const ctx: StreamFSMContext = { ...INITIAL_FSM_CONTEXT, sawError: true, errorMessage: 'fail' }
      expect(resolveTerminalState(ctx)).toBe('error')
    })

    test('cut_off when creditsExhausted with no done/error/abort', () => {
      const ctx: StreamFSMContext = { ...INITIAL_FSM_CONTEXT, creditsExhausted: true }
      expect(resolveTerminalState(ctx)).toBe('cut_off')
    })

    test('cut_off when assistantText exists with no done/error/abort', () => {
      const ctx: StreamFSMContext = { ...INITIAL_FSM_CONTEXT, assistantText: 'partial response' }
      expect(resolveTerminalState(ctx)).toBe('cut_off')
    })

    test('empty when nothing happened', () => {
      expect(resolveTerminalState(INITIAL_FSM_CONTEXT)).toBe('empty')
    })

    test('error takes priority over creditsExhausted', () => {
      const ctx: StreamFSMContext = { ...INITIAL_FSM_CONTEXT, sawError: true, creditsExhausted: true, errorMessage: 'err' }
      expect(resolveTerminalState(ctx)).toBe('error')
    })

    test('complete takes priority over error', () => {
      const ctx: StreamFSMContext = { ...INITIAL_FSM_CONTEXT, sawDone: true, sawError: true, errorMessage: 'err' }
      expect(resolveTerminalState(ctx)).toBe('complete')
    })

    test('aborted takes priority over complete', () => {
      const ctx: StreamFSMContext = { ...INITIAL_FSM_CONTEXT, aborted: true, sawDone: true }
      expect(resolveTerminalState(ctx)).toBe('aborted')
    })
  })

  describe('canTransition', () => {
    test('streaming → any terminal is legal', () => {
      expect(canTransition('streaming', 'complete')).toBe(true)
      expect(canTransition('streaming', 'cut_off')).toBe(true)
      expect(canTransition('streaming', 'empty')).toBe(true)
      expect(canTransition('streaming', 'error')).toBe(true)
      expect(canTransition('streaming', 'aborted')).toBe(true)
    })

    test('terminal → terminal is forbidden', () => {
      expect(canTransition('complete', 'error')).toBe(false)
      expect(canTransition('error', 'aborted')).toBe(false)
      expect(canTransition('aborted', 'complete')).toBe(false)
      expect(canTransition('cut_off', 'complete')).toBe(false)
      expect(canTransition('empty', 'complete')).toBe(false)
    })

    test('terminal → streaming is forbidden', () => {
      expect(canTransition('complete', 'streaming' as any)).toBe(false)
    })
  })

  describe('INITIAL_FSM_CONTEXT', () => {
    test('all fields are falsy/empty by default', () => {
      expect(INITIAL_FSM_CONTEXT.sawDone).toBe(false)
      expect(INITIAL_FSM_CONTEXT.sawError).toBe(false)
      expect(INITIAL_FSM_CONTEXT.creditsExhausted).toBe(false)
      expect(INITIAL_FSM_CONTEXT.aborted).toBe(false)
      expect(INITIAL_FSM_CONTEXT.assistantText).toBe('')
      expect(INITIAL_FSM_CONTEXT.errorMessage).toBeNull()
    })
  })
})
