/**
 * Security contract tests (QA-188, QA-189, QA-190).
 *
 * QA-188: Invalid query params rejected
 * QA-189: Path traversal attempt blocked
 * QA-190: WS malformed message ignored safely
 */

import { describe, test, expect } from 'bun:test'
import { validatePath, readString, readNumber, readBoolean } from '../../server/lib/validation.ts'
import { badRequest } from '../../server/lib/errors.ts'
import { parseInboundWSMessage } from '../../server/contracts/events.ts'

describe('QA-189: path traversal blocked', () => {
  test('.. segment is rejected', () => {
    expect(() => validatePath('/foo/../etc/passwd')).toThrow()
  })

  test('.. at start is rejected', () => {
    expect(() => validatePath('../etc/passwd')).toThrow()
  })

  test('encoded .. is rejected (backslash)', () => {
    expect(() => validatePath('/foo\\..\\etc')).toThrow()
  })

  test('null byte is rejected', () => {
    expect(() => validatePath('/foo\u0000bar')).toThrow()
  })

  test('newline is rejected', () => {
    expect(() => validatePath('/foo\nbar')).toThrow()
  })

  test('carriage return is rejected', () => {
    expect(() => validatePath('/foo\rbar')).toThrow()
  })

  test('single quote is rejected (shell injection)', () => {
    expect(() => validatePath("/foo'bar")).toThrow()
  })

  test('backtick is rejected (shell injection)', () => {
    expect(() => validatePath('/foo`bar`')).toThrow()
  })

  test('dollar sign is rejected (shell injection)', () => {
    expect(() => validatePath('/foo$bar')).toThrow()
  })

  test('path without leading slash is rejected', () => {
    expect(() => validatePath('foo/bar')).toThrow()
  })

  test('valid absolute path is accepted', () => {
    expect(validatePath('/foo/bar/baz.ts')).toBe('/foo/bar/baz.ts')
  })

  test('root path is accepted', () => {
    expect(validatePath('/')).toBe('/')
  })

  test('path with dots in filename is accepted', () => {
    expect(validatePath('/foo/.env')).toBe('/foo/.env')
  })

  test('path with hidden file is accepted', () => {
    expect(validatePath('/.gitignore')).toBe('/.gitignore')
  })
})

describe('QA-188: invalid query params rejected', () => {
  test('readString rejects non-string types', () => {
    const record = { name: 123 }
    expect(() => readString(record, 'name')).toThrow()
  })

  test('readString required rejects empty after trim', () => {
    const record = { name: '   ' }
    expect(() => readString(record, 'name', { required: true, minLength: 1 })).toThrow()
  })

  test('readNumber rejects non-number types', () => {
    const record = { count: 'abc' }
    expect(() => readNumber(record, 'count')).toThrow()
  })

  test('readNumber rejects NaN', () => {
    const record = { count: NaN }
    expect(() => readNumber(record, 'count')).toThrow()
  })

  test('readNumber rejects Infinity', () => {
    const record = { count: Infinity }
    expect(() => readNumber(record, 'count')).toThrow()
  })

  test('readBoolean rejects non-boolean types', () => {
    const record = { flag: 'true' }
    expect(() => readBoolean(record, 'flag')).toThrow()
  })

  test('readString with minLength rejects too-short strings', () => {
    const record = { name: 'ab' }
    expect(() => readString(record, 'name', { required: true, minLength: 3 })).toThrow()
  })
})

describe('QA-190: WS malformed message ignored safely', () => {
  test('null input returns null', () => {
    expect(parseInboundWSMessage(null)).toBeNull()
  })

  test('undefined input returns null', () => {
    expect(parseInboundWSMessage(undefined)).toBeNull()
  })

  test('string input returns null', () => {
    expect(parseInboundWSMessage('hello')).toBeNull()
  })

  test('number input returns null', () => {
    expect(parseInboundWSMessage(42)).toBeNull()
  })

  test('array input returns null', () => {
    expect(parseInboundWSMessage([1, 2, 3])).toBeNull()
  })

  test('object without type field returns null', () => {
    expect(parseInboundWSMessage({ foo: 'bar' })).toBeNull()
  })

  test('object with unknown type returns null', () => {
    expect(parseInboundWSMessage({ type: 'unknown_event' })).toBeNull()
  })

  test('object with valid terminal:resize type but missing fields returns null', () => {
    expect(parseInboundWSMessage({ type: 'terminal:resize' })).toBeNull()
  })

  test('object with valid terminal:input type but missing fields returns null', () => {
    expect(parseInboundWSMessage({ type: 'terminal:input' })).toBeNull()
  })

  test('valid terminal:resize message is parsed', () => {
    const msg = parseInboundWSMessage({ type: 'terminal:resize', rows: 24, cols: 80 })
    expect(msg).not.toBeNull()
    expect(msg?.type).toBe('terminal:resize')
  })

  test('valid terminal:input message is parsed', () => {
    const msg = parseInboundWSMessage({ type: 'terminal:input', data: 'ls\n' })
    expect(msg).not.toBeNull()
    expect(msg?.type).toBe('terminal:input')
  })
})
