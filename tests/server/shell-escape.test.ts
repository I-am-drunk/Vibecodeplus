import { describe, expect, test } from 'bun:test'
import { shellEscape } from '../../server/lib/shell.ts'

describe('shellEscape', () => {
  test('leaves safe strings unchanged', () => {
    expect(shellEscape('/home/user/workspace/foo.txt')).toBe('/home/user/workspace/foo.txt')
    expect(shellEscape('simple_name')).toBe('simple_name')
  })

  test('escapes single quotes', () => {
    expect(shellEscape("it's")).toBe("it'\\''s")
    expect(shellEscape("/path/with'quote")).toBe("/path/with'\\''quote")
  })

  test('handles multiple single quotes', () => {
    expect(shellEscape("a'b'c")).toBe("a'\\''b'\\''c")
  })

  test('handles empty string', () => {
    expect(shellEscape('')).toBe('')
  })
})
