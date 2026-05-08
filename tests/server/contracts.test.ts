import { describe, expect, test } from 'bun:test'
import {
  parseCliProjectsPayload,
  parseCreateProjectPayload,
} from '../../server/contracts/cli.ts'

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
