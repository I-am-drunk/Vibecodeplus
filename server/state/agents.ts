import { normalizeAgentUrl } from '../lib/agent-url.ts'

export type AgentHealth = 'ok' | 'degraded' | 'invalid' | 'acquiring'

export interface AgentResolverEntry {
  readonly projectId: string
  readonly url?: string
  readonly generation: number
  readonly health: AgentHealth
  readonly invalidationReason?: string
  readonly acquiredAt: Date
  readonly lastValidatedAt: Date
}

export class AgentResolver {
  private readonly entries = new Map<string, AgentResolverEntry>()
  private readonly acquirePending = new Map<string, Promise<string>>()

  getSync(projectId: string): string | undefined {
    const entry = this.entries.get(projectId)
    if (!entry?.url) return undefined
    return entry.url
  }

  getGeneration(projectId: string): number {
    return this.entries.get(projectId)?.generation ?? 0
  }

  register(projectId: string, url: string): void {
    const nextUrl = normalizeAgentUrl(url)
    if (!nextUrl) return
    const now = new Date()
    const existing = this.entries.get(projectId)
    this.entries.set(projectId, {
      projectId,
      url: nextUrl,
      generation: existing?.generation ?? 1,
      health: 'ok',
      acquiredAt: existing?.acquiredAt ?? now,
      lastValidatedAt: now,
    })
  }

  invalidate(projectId: string, reason: string): void {
    const now = new Date()
    const existing = this.entries.get(projectId)
    if (!existing) return
    this.entries.set(projectId, {
      ...existing,
      health: 'invalid',
      invalidationReason: reason,
      lastValidatedAt: now,
    })
  }

  delete(projectId: string): void {
    this.entries.delete(projectId)
    this.acquirePending.delete(projectId)
  }

  clear(): void {
    this.entries.clear()
    this.acquirePending.clear()
  }

  async resolve(
    projectId: string,
    acquire: () => Promise<string>,
    opts?: { forceReacquire?: boolean },
  ): Promise<string> {
    const cached = this.entries.get(projectId)
    if (cached?.url && cached.health === 'ok' && !opts?.forceReacquire) {
      return cached.url
    }

    const existingPending = this.acquirePending.get(projectId)
    if (existingPending && !opts?.forceReacquire) {
      return await existingPending
    }

    let promise: Promise<string> | undefined
    const execute = async (): Promise<string> => {
      const start = new Date()
      const nextGeneration = (cached?.generation ?? 0) + 1

      this.entries.set(projectId, {
        projectId,
        ...(cached?.url ? { url: cached.url } : {}),
        generation: nextGeneration,
        health: 'acquiring',
        invalidationReason: cached?.invalidationReason,
        acquiredAt: cached?.acquiredAt ?? start,
        lastValidatedAt: start,
      })

      try {
        const rawResolved = (await acquire()).trim()
        const resolved = normalizeAgentUrl(rawResolved)
        if (!resolved) throw new Error('AgentResolver acquire returned an invalid or empty agentUrl')
        const now = new Date()
        this.entries.set(projectId, {
          projectId,
          url: resolved,
          generation: nextGeneration,
          health: 'ok',
          acquiredAt: now,
          lastValidatedAt: now,
        })
        return resolved
      } catch (error) {
        const now = new Date()
        const stableGeneration = cached?.generation ?? 0
        this.entries.set(projectId, {
          projectId,
          ...(cached?.url ? { url: cached.url } : {}),
          generation: stableGeneration,
          health: 'invalid',
          invalidationReason: error instanceof Error ? error.message : String(error),
          acquiredAt: cached?.acquiredAt ?? now,
          lastValidatedAt: now,
        })
        throw error
      } finally {
        if (this.acquirePending.get(projectId) === promise) {
          this.acquirePending.delete(projectId)
        }
      }
    }

    promise = execute()
    this.acquirePending.set(projectId, promise)
    return await promise
  }
}

export const agentResolver = new AgentResolver()

export const agentUrls = {
  get: (id: string) => agentResolver.getSync(id),
  set: (id: string, url: string) => agentResolver.register(id, url),
  has: (id: string) => !!agentResolver.getSync(id),
  delete: (id: string) => agentResolver.delete(id),
  clear: () => agentResolver.clear(),
}
