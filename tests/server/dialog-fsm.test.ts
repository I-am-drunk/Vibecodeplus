import { describe, test, expect } from 'bun:test'
import {
  isLegalDialogTransition,
  nextDialogState,
  isDialogTerminal,
  validateDialogExclusivity,
  type DialogState,
  type DialogType,
} from '../../server/services/dialogStateMachine.ts'

describe('dialog state machine', () => {
  describe('isLegalDialogTransition', () => {
    test('closed → opening is legal', () => {
      expect(isLegalDialogTransition('closed', 'opening')).toBe(true)
    })

    test('opening → open is legal', () => {
      expect(isLegalDialogTransition('opening', 'open')).toBe(true)
    })

    test('open → submitting is legal', () => {
      expect(isLegalDialogTransition('open', 'submitting')).toBe(true)
    })

    test('submitting → success is legal', () => {
      expect(isLegalDialogTransition('submitting', 'success')).toBe(true)
    })

    test('submitting → error is legal', () => {
      expect(isLegalDialogTransition('submitting', 'error')).toBe(true)
    })

    test('error → closed is legal', () => {
      expect(isLegalDialogTransition('error', 'closed')).toBe(true)
    })

    test('error → open is legal (retry)', () => {
      expect(isLegalDialogTransition('error', 'open')).toBe(true)
    })

    test('closed → open is illegal (must go through opening)', () => {
      expect(isLegalDialogTransition('closed', 'open')).toBe(false)
    })

    test('closed → submitting is illegal', () => {
      expect(isLegalDialogTransition('closed', 'submitting')).toBe(false)
    })

    test('open → success is illegal (must submit first)', () => {
      expect(isLegalDialogTransition('open', 'success')).toBe(false)
    })

    test('same state is idempotent', () => {
      expect(isLegalDialogTransition('closed', 'closed')).toBe(true)
      expect(isLegalDialogTransition('open', 'open')).toBe(true)
    })
  })

  describe('nextDialogState', () => {
    test('open event from closed → opening', () => {
      expect(nextDialogState('closed', 'open')).toBe('opening')
    })

    test('submit event from open → submitting', () => {
      expect(nextDialogState('open', 'submit')).toBe('submitting')
    })

    test('success event from submitting → success', () => {
      expect(nextDialogState('submitting', 'success')).toBe('success')
    })

    test('error event from submitting → error', () => {
      expect(nextDialogState('submitting', 'error')).toBe('error')
    })

    test('error event from opening → error', () => {
      expect(nextDialogState('opening', 'error')).toBe('error')
    })

    test('close event from open → closed', () => {
      expect(nextDialogState('open', 'close')).toBe('closed')
    })

    test('close event from error → closed', () => {
      expect(nextDialogState('error', 'close')).toBe('closed')
    })

    test('retry event from error → open', () => {
      expect(nextDialogState('error', 'retry')).toBe('open')
    })

    test('submit from closed is illegal', () => {
      expect(nextDialogState('closed', 'submit')).toBeNull()
    })

    test('open from submitting is illegal', () => {
      expect(nextDialogState('submitting', 'open')).toBeNull()
    })

    test('unknown event returns null', () => {
      expect(nextDialogState('closed', 'unknown' as any)).toBeNull()
    })
  })

  describe('isDialogTerminal', () => {
    test('success is terminal', () => {
      expect(isDialogTerminal('success')).toBe(true)
    })

    test('error is terminal', () => {
      expect(isDialogTerminal('error')).toBe(true)
    })

    test('closed is terminal', () => {
      expect(isDialogTerminal('closed')).toBe(true)
    })

    test('open is not terminal', () => {
      expect(isDialogTerminal('open')).toBe(false)
    })

    test('submitting is not terminal', () => {
      expect(isDialogTerminal('submitting')).toBe(false)
    })

    test('opening is not terminal', () => {
      expect(isDialogTerminal('opening')).toBe(false)
    })
  })

  describe('validateDialogExclusivity', () => {
    test('no conflict when no dialog is active', () => {
      const active = new Map<DialogType, DialogState>()
      expect(validateDialogExclusivity(active, 'key_recovery')).toBeNull()
    })

    test('no conflict when dialog is closed', () => {
      const active = new Map<DialogType, DialogState>([['key_recovery', 'closed']])
      expect(validateDialogExclusivity(active, 'key_recovery')).toBeNull()
    })

    test('conflict when same dialog type is already open', () => {
      const active = new Map<DialogType, DialogState>([['key_recovery', 'open']])
      expect(validateDialogExclusivity(active, 'key_recovery')).toBe('key_recovery')
    })

    test('conflict when same dialog type is submitting', () => {
      const active = new Map<DialogType, DialogState>([['credits', 'submitting']])
      expect(validateDialogExclusivity(active, 'credits')).toBe('credits')
    })

    test('no conflict for different dialog types', () => {
      const active = new Map<DialogType, DialogState>([['key_recovery', 'open']])
      expect(validateDialogExclusivity(active, 'credits')).toBeNull()
    })

    test('multiple dialogs of different types can be open', () => {
      const active = new Map<DialogType, DialogState>([
        ['key_recovery', 'open'],
        ['credits', 'submitting'],
      ])
      expect(validateDialogExclusivity(active, 'continuation')).toBeNull()
    })
  })

  describe('full dialog lifecycle', () => {
    test('key recovery: closed → opening → open → submitting → success → closed', () => {
      let state: DialogState = 'closed'
      expect(nextDialogState(state, 'open')).toBe('opening')
      state = 'opening'
      expect(nextDialogState(state, 'open' as any)).toBeNull() // can't skip
      // Simulate opening completes
      state = 'open'
      expect(nextDialogState(state, 'submit')).toBe('submitting')
      state = 'submitting'
      expect(nextDialogState(state, 'success')).toBe('success')
      state = 'success'
      expect(nextDialogState(state, 'close')).toBe('closed')
    })

    test('credits: closed → opening → open → submitting → error → retry → open → submitting → success', () => {
      let state: DialogState = 'closed'
      state = nextDialogState(state, 'open')!
      expect(state).toBe('opening')
      state = 'open'
      state = nextDialogState(state, 'submit')!
      expect(state).toBe('submitting')
      state = nextDialogState(state, 'error')!
      expect(state).toBe('error')
      state = nextDialogState(state, 'retry')!
      expect(state).toBe('open')
      state = nextDialogState(state, 'submit')!
      expect(state).toBe('submitting')
      state = nextDialogState(state, 'success')!
      expect(state).toBe('success')
    })
  })
})
