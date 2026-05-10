import { describe, test, expect } from 'bun:test'
import {
  computeReconnectDelay,
  isReconnectAllowed,
  resetReconnectState,
  HandlerRegistry,
  BASE_DELAY_MS,
  MAX_DELAY_MS,
  MAX_ATTEMPTS,
} from '../../server/services/wsReconnectPolicy.ts'

describe('WS reconnect policy', () => {
  describe('computeReconnectDelay', () => {
    test('attempt 1 returns BASE_DELAY + jitter', () => {
      const delay = computeReconnectDelay(1)
      expect(delay).toBeGreaterThanOrEqual(BASE_DELAY_MS)
      expect(delay).toBeLessThanOrEqual(BASE_DELAY_MS + 500)
    })

    test('attempt 2 returns 2*BASE_DELAY + jitter', () => {
      const delay = computeReconnectDelay(2)
      expect(delay).toBeGreaterThanOrEqual(BASE_DELAY_MS * 2)
      expect(delay).toBeLessThanOrEqual(BASE_DELAY_MS * 2 + 500)
    })

    test('attempt 3 returns 4*BASE_DELAY + jitter', () => {
      const delay = computeReconnectDelay(3)
      expect(delay).toBeGreaterThanOrEqual(BASE_DELAY_MS * 4)
      expect(delay).toBeLessThanOrEqual(BASE_DELAY_MS * 4 + 500)
    })

    test('never exceeds MAX_DELAY_MS', () => {
      const delay = computeReconnectDelay(100)
      expect(delay).toBeLessThanOrEqual(MAX_DELAY_MS)
    })

    test('attempt < 1 returns BASE_DELAY', () => {
      const delay = computeReconnectDelay(0)
      expect(delay).toBeGreaterThanOrEqual(BASE_DELAY_MS)
    })
  })

  describe('isReconnectAllowed', () => {
    test('allows attempts up to MAX_ATTEMPTS', () => {
      for (let i = 1; i <= MAX_ATTEMPTS; i++) {
        expect(isReconnectAllowed(i)).toBe(true)
      }
    })

    test('rejects attempts beyond MAX_ATTEMPTS', () => {
      expect(isReconnectAllowed(MAX_ATTEMPTS + 1)).toBe(false)
      expect(isReconnectAllowed(100)).toBe(false)
    })
  })

  describe('resetReconnectState', () => {
    test('returns attempt 0', () => {
      expect(resetReconnectState()).toEqual({ attempt: 0 })
    })
  })

  describe('HandlerRegistry', () => {
    test('register returns true for new key', () => {
      const registry = new HandlerRegistry()
      expect(registry.register('handler:project:abc')).toBe(true)
    })

    test('register returns false for duplicate key', () => {
      const registry = new HandlerRegistry()
      registry.register('handler:project:abc')
      expect(registry.register('handler:project:abc')).toBe(false)
    })

    test('isRegistered returns true after register', () => {
      const registry = new HandlerRegistry()
      registry.register('handler:project:abc')
      expect(registry.isRegistered('handler:project:abc')).toBe(true)
    })

    test('isRegistered returns false for unregistered key', () => {
      const registry = new HandlerRegistry()
      expect(registry.isRegistered('handler:project:abc')).toBe(false)
    })

    test('unregister removes key', () => {
      const registry = new HandlerRegistry()
      registry.register('handler:project:abc')
      registry.unregister('handler:project:abc')
      expect(registry.isRegistered('handler:project:abc')).toBe(false)
    })

    test('size tracks registered count', () => {
      const registry = new HandlerRegistry()
      expect(registry.size).toBe(0)
      registry.register('a')
      expect(registry.size).toBe(1)
      registry.register('b')
      expect(registry.size).toBe(2)
      registry.register('a') // duplicate
      expect(registry.size).toBe(2)
      registry.unregister('a')
      expect(registry.size).toBe(1)
    })

    test('clear removes all registrations', () => {
      const registry = new HandlerRegistry()
      registry.register('a')
      registry.register('b')
      registry.register('c')
      registry.clear()
      expect(registry.size).toBe(0)
      expect(registry.isRegistered('a')).toBe(false)
    })
  })
})
