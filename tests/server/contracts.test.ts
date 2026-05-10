import { describe, expect, test } from 'bun:test'
import {
  parseCliProjectsPayload,
  parseCreateProjectPayload,
} from '../../server/contracts/cli.ts'
import { validatePath } from '../../server/lib/validation.ts'

describe('CLI contracts handling', () => {
  test('parseCliProjectsPayload rejects unsafe inputs and decodes safely', () => {
    // Malformed inputs
    expect(parseCliProjectsPayload(null)).toBeNull()
    expect(parseCliProjectsPayload('string')).toBeNull()
    expect(parseCliProjectsPayload({ data: 'string' })).toBeNull()

    // Valid array payload
    expect(parseCliProjectsPayload([
      { id: '1', name: 'Project 1' },
      { id: '2', name: 'Project 2', sandbox: { status: 'running' } }
    ])).toHaveLength(2)

    // Valid object payload
    expect(parseCliProjectsPayload({ projects: [{ id: '3', name: 'P3' }] })).toHaveLength(1)
  })

  test('parseCreateProjectPayload extracts id properly without deep access crashes', () => {
    expect(parseCreateProjectPayload(null)).toBeNull()
    expect(parseCreateProjectPayload({})).toBeNull()
    
    expect(parseCreateProjectPayload({ id: 'proj-1' })).toEqual({ id: 'proj-1' })
    expect(parseCreateProjectPayload({ projectId: 'proj-2' })).toEqual({ id: 'proj-2' })
  })
})

describe('Route validation helpers', () => {
  test('validatePath enforces strict, safe absolute paths', () => {
    expect(validatePath('/', 'path')).toBe('/')
    expect(validatePath('/foo/bar.txt', 'path')).toBe('/foo/bar.txt')
    expect(validatePath('/foo..bar/baz', 'path')).toBe('/foo..bar/baz')

    expect(() => validatePath('', 'path')).toThrow()
    expect(() => validatePath('   ', 'path')).toThrow()
    expect(() => validatePath('relative/path', 'path')).toThrow()
    expect(() => validatePath('\\windows\\path', 'path')).toThrow()
    expect(() => validatePath('/has/..', 'path')).toThrow()
    expect(() => validatePath('/has/./file', 'path')).toThrow()
    expect(() => validatePath('/../file', 'path')).toThrow()
    expect(() => validatePath('/has\u0000null', 'path')).toThrow()
    expect(() => validatePath('/has\rcr', 'path')).toThrow()
    expect(() => validatePath('/has\nlf', 'path')).toThrow()
    expect(() => validatePath("/has'single-quote", 'path')).toThrow()
    expect(() => validatePath('/has`backtick', 'path')).toThrow()
    expect(() => validatePath('/has$dollar', 'path')).toThrow()
  })
})
