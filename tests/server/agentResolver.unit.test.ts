import { describe, expect, test } from 'bun:test'

import { AgentResolver, agentUrls } from '../../server/state/agents.ts'

describe('AgentResolver', () => {
  test('singleflights concurrent resolves', async () => {
    const resolver = new AgentResolver()

    let calls = 0
    const acquire = async () => {
      calls += 1
      await new Promise<void>((resolve) => setTimeout(resolve, 10))
      return 'https://agent.test'
    }

    const results = await Promise.all(Array.from({ length: 10 }, () => resolver.resolve('proj', acquire)))

    expect(calls).toBe(1)
    expect(results.every((url) => url === 'https://agent.test')).toBe(true)
    expect(resolver.getGeneration('proj')).toBe(1)
  })

  test('invalidate transitions to reacquire', async () => {
    const resolver = new AgentResolver()

    let n = 0
    const acquire = async () => {
      n += 1
      return `https://agent-${n}.test`
    }

    const first = await resolver.resolve('proj', acquire)
    expect(first).toBe('https://agent-1.test')

    resolver.invalidate('proj', 'forced')

    const second = await resolver.resolve('proj', acquire)
    expect(second).toBe('https://agent-2.test')
    expect(resolver.getGeneration('proj')).toBe(2)
  })

  test('register validates URLs and rejects non-http', () => {
    const resolver = new AgentResolver()

    resolver.register('p1', 'https://valid.example.com')
    expect(resolver.getSync('p1')).toBe('https://valid.example.com')

    resolver.register('p2', 'ftp://invalid.example.com')
    expect(resolver.getSync('p2')).toBeUndefined()

    resolver.register('p3', '')
    expect(resolver.getSync('p3')).toBeUndefined()

    resolver.register('p4', '   ')
    expect(resolver.getSync('p4')).toBeUndefined()
  })

  test('register preserves generation on update', async () => {
    const resolver = new AgentResolver()

    const acquire = async () => 'https://first.test'
    await resolver.resolve('proj', acquire)
    expect(resolver.getGeneration('proj')).toBe(1)

    resolver.register('proj', 'https://second.test')
    expect(resolver.getSync('proj')).toBe('https://second.test')
    expect(resolver.getGeneration('proj')).toBe(1)
  })

  test('delete removes entry', () => {
    const resolver = new AgentResolver()

    resolver.register('proj', 'https://agent.test')
    expect(resolver.getSync('proj')).toBe('https://agent.test')

    resolver.delete('proj')
    expect(resolver.getSync('proj')).toBeUndefined()
  })

  test('clear removes all entries', () => {
    const resolver = new AgentResolver()

    resolver.register('p1', 'https://a.test')
    resolver.register('p2', 'https://b.test')

    resolver.clear()
    expect(resolver.getSync('p1')).toBeUndefined()
    expect(resolver.getSync('p2')).toBeUndefined()
  })

  test('resolve validates acquire result and rejects non-http', async () => {
    const resolver = new AgentResolver()

    const acquireBad = async () => 'ftp://bad-protocol.test'
    await expect(resolver.resolve('proj', acquireBad)).rejects.toThrow(
      'AgentResolver acquire returned an invalid or empty agentUrl',
    )

    expect(resolver.getSync('proj')).toBeUndefined()
  })

  test('forceReacquire does not break singleflight for subsequent callers', async () => {
    const resolver = new AgentResolver()

    let n = 0
    const acquire = async () => {
      n += 1
      await new Promise<void>((r) => setTimeout(r, 5))
      return `https://agent-${n}.test`
    }

    const first = await resolver.resolve('proj', acquire)
    expect(first).toBe('https://agent-1.test')
    expect(n).toBe(1)

    const second = await resolver.resolve('proj', acquire, { forceReacquire: true })
    expect(second).toBe('https://agent-2.test')
    expect(n).toBe(2)

    const third = await resolver.resolve('proj', acquire)
    expect(third).toBe('https://agent-2.test')
    expect(n).toBe(2)
  })

  test('failed resolve preserves previous URL and does not bump generation', async () => {
    const resolver = new AgentResolver()

    const acquireOk = async () => 'https://ok.test'
    const first = await resolver.resolve('proj', acquireOk)
    expect(first).toBe('https://ok.test')
    expect(resolver.getGeneration('proj')).toBe(1)

    const acquireFail = async () => {
      throw new Error('sandbox unavailable')
    }
    await expect(resolver.resolve('proj', acquireFail, { forceReacquire: true })).rejects.toThrow(
      'sandbox unavailable',
    )

    expect(resolver.getSync('proj')).toBe('https://ok.test')
    expect(resolver.getGeneration('proj')).toBe(1)
  })
})

describe('agentUrls compatibility shim', () => {
  test('get/set/has/delete/clear delegate to agentResolver', () => {
    agentUrls.clear()

    expect(agentUrls.has('p1')).toBe(false)
    expect(agentUrls.get('p1')).toBeUndefined()

    agentUrls.set('p1', 'https://agent.test')
    expect(agentUrls.has('p1')).toBe(true)
    expect(agentUrls.get('p1')).toBe('https://agent.test')

    agentUrls.delete('p1')
    expect(agentUrls.has('p1')).toBe(false)
    expect(agentUrls.get('p1')).toBeUndefined()

    agentUrls.set('p2', 'https://a.test')
    agentUrls.set('p3', 'https://b.test')
    agentUrls.clear()
    expect(agentUrls.has('p2')).toBe(false)
    expect(agentUrls.has('p3')).toBe(false)
  })

  test('set rejects invalid URLs silently', () => {
    agentUrls.clear()

    agentUrls.set('p1', 'ftp://invalid.test')
    expect(agentUrls.has('p1')).toBe(false)

    agentUrls.set('p2', '')
    expect(agentUrls.has('p2')).toBe(false)
  })
})
