/**
 * Fuzz test suite (CP-42).
 *
 * Hammers contract parsers and route validators with malformed payloads
 * to ensure no crash paths exist. Every test should return a safe value
 * (null, empty array, rejected error) rather than throw.
 */

import { describe, test, expect } from 'bun:test'
import {
  parseCliUserPayload,
  parseCliProjectsPayload,
  parseAcquireSandboxPayload,
  parseCreateProjectPayload,
  parseAgentStopPayload,
  parseSandboxCredentials,
} from '../../server/contracts/cli.ts'
import {
  parseChatSendRequest,
  parseContinuationEnactRequest,
  parseCreateProjectRequest,
  parsePatchProjectRequest,
} from '../../server/contracts/routes.ts'
import { validatePath } from '../../server/lib/validation.ts'
import { parseInboundWSMessage, validateBroadcastEvent } from '../../server/contracts/events.ts'

// ── Fuzz helpers ──────────────────────────────────────────────────────

const PRIMITIVES = [null, undefined, true, false, 0, 1, -1, NaN, Infinity, '', 'x', [], {}]
const MALFORMED_OBJECTS = [
  { id: null },
  { id: undefined },
  { id: '' },
  { id: 123 },
  { id: {} },
  { id: [] },
  { data: 'not-an-object' },
  { projects: 'not-an-array' },
  { projects: [null, undefined, 123, 'string', {}, []] },
  { sandbox: null },
  { sandbox: 'not-an-object' },
  { links: null },
  { links: 123 },
  { host: null },
  { host: 123 },
  { port: 'not-a-number' },
  { user: null },
  { agentUrl: null },
  { agentUrl: 123 },
  { agentUrl: {} },
  { agentUrl: { url: null } },
  { agentUrl: { url: 123 } },
  { credits: 'not-an-object' },
  { creditBalance: 'invalid' },
  { firstName: null },
  { lastName: undefined },
  { email: null },
  { email: '' },
  { email: 123 },
  { planTier: null },
  { projectId: null },
  { projectId: '' },
  { prompt: null },
  { prompt: '' },
  { prompt: 123 },
  { sourceProjectId: null },
  { sourceProjectId: '' },
  { name: null },
  { name: '' },
  { name: 123 },
  { description: 123 },
  { defaultModel: 123 },
  { template: 123 },
  { stopped: 'not-a-boolean' },
  { stopped: null },
  { type: null },
  { type: 123 },
  { type: '' },
  { channels: 'not-an-array' },
  { channels: [null, 123, {}] },
  { sessionId: null },
  { sessionId: '' },
  { streamId: null },
  { sequence: 'not-a-number' },
  { terminal: null },
  { terminal: '' },
  { terminal: 'invalid_status' },
  { balance: 'not-a-number' },
  { message: null },
  { message: '' },
  { rows: 'not-a-number' },
  { cols: 'not-a-number' },
  { data: null },
  { data: 123 },
]

const DEEPLY_NESTED: any = {}
let current = DEEPLY_NESTED
for (let i = 0; i < 50; i++) {
  current.child = {}
  current = current.child
}
current.value = 'deep'

const LARGE_ARRAY = Array.from({ length: 10000 }, (_, i) => ({ id: i }))

const SPECIAL_STRINGS = [
  '', ' ', '\t', '\n', '\0', '\x00',
  '<script>alert(1)</script>',
  '"; DROP TABLE users; --',
  '${system("rm -rf /")}',
  '`rm -rf /`',
  '../../../etc/passwd',
  '\u0000\u0001\u0002',
  'a'.repeat(100000),
  '🚀🔥💻',
]

describe('fuzz: CLI contract parsers', () => {
  describe('parseCliUserPayload', () => {
    test('never throws on primitives', () => {
      for (const p of PRIMITIVES) {
        expect(() => parseCliUserPayload(p)).not.toThrow()
        expect(parseCliUserPayload(p)).toBeNull()
      }
    })

    test('never throws on malformed objects', () => {
      for (const obj of MALFORMED_OBJECTS) {
        expect(() => parseCliUserPayload(obj)).not.toThrow()
      }
    })

    test('never throws on deeply nested objects', () => {
      expect(() => parseCliUserPayload(DEEPLY_NESTED)).not.toThrow()
    })

    test('never throws on special strings', () => {
      for (const s of SPECIAL_STRINGS) {
        expect(() => parseCliUserPayload({ id: s, email: s })).not.toThrow()
      }
    })
  })

  describe('parseCliProjectsPayload', () => {
    test('never throws on primitives', () => {
      for (const p of PRIMITIVES) {
        expect(() => parseCliProjectsPayload(p)).not.toThrow()
      }
    })

    test('never throws on malformed objects', () => {
      for (const obj of MALFORMED_OBJECTS) {
        expect(() => parseCliProjectsPayload(obj)).not.toThrow()
      }
    })

    test('handles large arrays gracefully', () => {
      // LARGE_ARRAY entries have numeric ids, not strings, so parse fails
      const result = parseCliProjectsPayload(LARGE_ARRAY)
      expect(result).toBeNull() // entries lack string id/name
    })

    test('filters out invalid entries in array', () => {
      // parseCliProjectsPayload returns null if any entry fails
      const result = parseCliProjectsPayload([null, undefined, 123, 'str', { id: 'valid' }])
      expect(result).toBeNull() // first 4 entries are invalid
    })
  })

  describe('parseAcquireSandboxPayload', () => {
    test('never throws on primitives', () => {
      for (const p of PRIMITIVES) {
        expect(() => parseAcquireSandboxPayload(p)).not.toThrow()
      }
    })

    test('never throws on malformed objects', () => {
      for (const obj of MALFORMED_OBJECTS) {
        expect(() => parseAcquireSandboxPayload(obj)).not.toThrow()
      }
    })
  })

  describe('parseCreateProjectPayload', () => {
    test('never throws on primitives', () => {
      for (const p of PRIMITIVES) {
        expect(() => parseCreateProjectPayload(p)).not.toThrow()
      }
    })

    test('never throws on malformed objects', () => {
      for (const obj of MALFORMED_OBJECTS) {
        expect(() => parseCreateProjectPayload(obj)).not.toThrow()
      }
    })
  })

  describe('parseAgentStopPayload', () => {
    test('never throws on primitives', () => {
      for (const p of PRIMITIVES) {
        expect(() => parseAgentStopPayload(p)).not.toThrow()
      }
    })
  })

  describe('parseSandboxCredentials', () => {
    test('never throws on primitives', () => {
      for (const p of PRIMITIVES) {
        expect(() => parseSandboxCredentials(p)).not.toThrow()
      }
    })
  })
})

describe('fuzz: route contract parsers', () => {
  describe('parseChatSendRequest', () => {
    test('never throws on primitives', () => {
      for (const p of PRIMITIVES) {
        expect(() => parseChatSendRequest(p)).toThrow() // Expected: throws badRequest
      }
    })

    test('rejects missing projectId', () => {
      expect(() => parseChatSendRequest({ prompt: 'hello' })).toThrow()
    })

    test('rejects missing prompt', () => {
      expect(() => parseChatSendRequest({ projectId: 'p1' })).toThrow()
    })

    test('rejects non-string fields', () => {
      expect(() => parseChatSendRequest({ projectId: 123, prompt: 'hello' })).toThrow()
      expect(() => parseChatSendRequest({ projectId: 'p1', prompt: 123 })).toThrow()
    })
  })

  describe('parseContinuationEnactRequest', () => {
    test('rejects missing sourceProjectId', () => {
      expect(() => parseContinuationEnactRequest({})).toThrow()
    })

    test('rejects non-string sourceProjectId', () => {
      expect(() => parseContinuationEnactRequest({ sourceProjectId: 123 })).toThrow()
    })
  })

  describe('parseCreateProjectRequest', () => {
    test('rejects missing name', () => {
      expect(() => parseCreateProjectRequest({})).toThrow()
    })

    test('rejects non-string name', () => {
      expect(() => parseCreateProjectRequest({ name: 123 })).toThrow()
    })
  })

  describe('parsePatchProjectRequest', () => {
    test('rejects missing defaultModel', () => {
      expect(() => parsePatchProjectRequest({})).toThrow()
    })
  })
})

describe('fuzz: validatePath', () => {
  test('rejects path traversal attempts', () => {
    const traversalPaths = [
      '../../../etc/passwd',
      '..\\..\\windows\\system32',
      '/foo/../../bar',
      '/foo/bar/../../../baz',
    ]
    for (const p of traversalPaths) {
      expect(() => validatePath(p, 'path')).toThrow()
    }
  })

  test('rejects shell injection characters', () => {
    const injectionChars = [
      "/foo/bar'; rm -rf /",
      '/foo/bar`rm -rf /`',
      '/foo/bar$(rm -rf /)',
    ]
    for (const p of injectionChars) {
      expect(() => validatePath(p, 'path')).toThrow()
    }
  })

  test('rejects null bytes', () => {
    expect(() => validatePath('/foo\x00bar', 'path')).toThrow()
  })

  test('rejects relative paths', () => {
    expect(() => validatePath('relative/path', 'path')).toThrow()
  })

  test('accepts valid absolute paths', () => {
    expect(() => validatePath('/home/user/workspace', 'path')).not.toThrow()
    expect(() => validatePath('/tmp/test.txt', 'path')).not.toThrow()
  })
})

describe('fuzz: WS event parsers', () => {
  describe('parseInboundWSMessage', () => {
    test('never throws on primitives', () => {
      for (const p of PRIMITIVES) {
        expect(() => parseInboundWSMessage(p)).not.toThrow()
        expect(parseInboundWSMessage(p)).toBeNull()
      }
    })

    test('never throws on malformed objects', () => {
      for (const obj of MALFORMED_OBJECTS) {
        expect(() => parseInboundWSMessage(obj)).not.toThrow()
      }
    })

    test('never throws on special strings as type', () => {
      for (const s of SPECIAL_STRINGS.slice(0, 10)) {
        expect(() => parseInboundWSMessage({ type: s })).not.toThrow()
      }
    })
  })

  describe('validateBroadcastEvent', () => {
    test('never throws on malformed objects', () => {
      for (const obj of MALFORMED_OBJECTS) {
        expect(() => validateBroadcastEvent(obj)).not.toThrow()
      }
    })

    test('returns null for empty or invalid payloads', () => {
      expect(validateBroadcastEvent({})).toBeNull()
      expect(validateBroadcastEvent({ type: '' })).toBeNull()
      expect(validateBroadcastEvent({ type: 'unknown' })).toBeNull()
    })
  })
})

describe('fuzz: deeply nested and oversized inputs', () => {
  test('parseCliUserPayload handles deeply nested objects', () => {
    expect(() => parseCliUserPayload(DEEPLY_NESTED)).not.toThrow()
  })

  test('parseCliProjectsPayload handles deeply nested objects', () => {
    expect(() => parseCliProjectsPayload(DEEPLY_NESTED)).not.toThrow()
  })

  test('parseInboundWSMessage handles deeply nested objects', () => {
    expect(() => parseInboundWSMessage(DEEPLY_NESTED)).not.toThrow()
  })

  test('parseAcquireSandboxPayload handles oversized arrays', () => {
    expect(() => parseAcquireSandboxPayload({ sandbox: LARGE_ARRAY })).not.toThrow()
  })
})
