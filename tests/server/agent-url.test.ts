import { describe, expect, test } from 'bun:test'
import { normalizeAgentUrl } from '../../server/lib/agent-url.ts'

describe('normalizeAgentUrl', () => {
  test('accepts valid http and https URLs', () => {
    expect(normalizeAgentUrl('http://localhost:8080/agent')).toBe('http://localhost:8080/agent')
    expect(normalizeAgentUrl('https://agent.example.com/v1')).toBe('https://agent.example.com/v1')
  })

  test('trims whitespace', () => {
    expect(normalizeAgentUrl('  https://agent.example.com  ')).toBe('https://agent.example.com')
  })

  test('rejects empty, whitespace, and non-string inputs', () => {
    expect(normalizeAgentUrl('')).toBe('')
    expect(normalizeAgentUrl('   ')).toBe('')
    expect(normalizeAgentUrl(null as any)).toBe('')
    expect(normalizeAgentUrl(undefined as any)).toBe('')
    expect(normalizeAgentUrl(42 as any)).toBe('')
  })

  test('rejects non-http protocols', () => {
    expect(normalizeAgentUrl('ftp://files.example.com')).toBe('')
    expect(normalizeAgentUrl('ws://socket.example.com')).toBe('')
    expect(normalizeAgentUrl('javascript:alert(1)')).toBe('')
  })

  test('rejects malformed URLs', () => {
    expect(normalizeAgentUrl('not-a-url')).toBe('')
    expect(normalizeAgentUrl('://missing-scheme')).toBe('')
  })
})
