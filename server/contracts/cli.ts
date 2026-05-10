import type { AgentStreamEvent, SandboxCredentials, VibecodeProject, VibecodeUser } from '../cli/types.ts'
import { isRecord } from '../lib/validation.ts'

function asString(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((entry) => asString(entry)).filter((entry): entry is string => !!entry)
}

export function parseCliUserPayload(payload: unknown): VibecodeUser | null {
  if (!isRecord(payload)) return null

  const id = asString(payload.id)
  const email = asString(payload.email)
  if (!id || !email) return null

  const creditsRaw = isRecord(payload.credits) ? payload.credits : {}
  const balance = asNumber(payload.creditBalance ?? creditsRaw.balance) ?? 0

  const fullName = [asString(payload.firstName), asString(payload.lastName)].filter(Boolean).join(' ').trim()

  const plan = asString(payload.planTier)

  return {
    id,
    email,
    name: fullName || email,
    plan: (plan === 'pro' || plan === 'team' || plan === 'enterprise' ? plan : 'free') as VibecodeUser['plan'],
    credits: {
      balance: balance / 100,
      used: asNumber(creditsRaw.used) ?? 0,
      limit: asNumber(creditsRaw.limit),
    },
  }
}

export function parseCliProject(payload: unknown): VibecodeProject | null {
  if (!isRecord(payload)) return null

  const id = asString(payload.id)
  const name = asString(payload.name)
  if (!id || !name) return null

  const sandboxRaw = isRecord(payload.sandbox) ? payload.sandbox : {}
  const sandboxStatus = asString(sandboxRaw.status)

  return {
    id,
    name,
    description: asString(payload.description) ?? undefined,
    created_at: asString(payload.created_at) ?? new Date().toISOString(),
    updated_at: asString(payload.updated_at) ?? new Date().toISOString(),
    sandbox: {
      status:
        sandboxStatus === 'running' || sandboxStatus === 'provisioning' || sandboxStatus === 'error'
          ? sandboxStatus
          : 'stopped',
      region: asString(sandboxRaw.region) ?? undefined,
    },
  }
}

export function parseCliProjectsPayload(payload: unknown): VibecodeProject[] | null {
  const projectsValue = Array.isArray(payload)
    ? payload
    : isRecord(payload) && Array.isArray(payload.projects)
      ? payload.projects
      : null

  if (!projectsValue) return null

  const projects: VibecodeProject[] = []
  for (const entry of projectsValue) {
    const parsed = parseCliProject(entry)
    if (!parsed) return null
    projects.push(parsed)
  }

  return projects
}

export function parseSandboxCredentials(payload: unknown): SandboxCredentials | null {
  if (!isRecord(payload)) return null

  const host = asString(payload.host ?? payload.ipv4)
  const port = asNumber(payload.port ?? payload.sshPort)
  const user = asString(payload.user ?? payload.sshUsername)
  const keyPath = asString(payload.key_path ?? payload.sshKeyPath)

  if (!host || !port || !user) return null

  return {
    host,
    port,
    user,
    key_path: keyPath ?? '',
    password: asString(payload.password ?? payload.sshPassword) ?? undefined,
    privateKey: asString(payload.privateKey) ?? undefined,
    sshPassword: asString(payload.sshPassword) ?? undefined,
  }
}

export function parseAcquireSandboxPayload(payload: unknown): { sandbox: SandboxCredentials; links?: Record<string, unknown> } | null {
  if (!isRecord(payload)) return null

  // The CLI may return SSH fields at different levels:
  // - sandbox sub-object: { sandbox: { id, status, sshPassword, host?, port?, user? } }
  // - top-level: { host, port, user, sshPassword, ... }
  // Merge both levels so we capture all available fields
  const sandboxSub = isRecord(payload.sandbox) ? payload.sandbox : {}
  const merged = { ...payload, ...sandboxSub }
  // Remove the nested sandbox key to avoid confusion
  delete (merged as any).sandbox

  const sandbox = parseSandboxCredentials(merged)
  if (!sandbox) return null

  return {
    sandbox,
    links: isRecord(payload.links) ? payload.links : undefined,
  }
}

const STREAM_EVENT_TYPES = new Set([
  'init',
  'text',
  'thinking',
  'tool_use',
  'tool_result',
  'commit',
  'done',
  'error',
  'credits_exhausted',
  'credits_low',
])

export function parseAgentStreamEvent(payload: unknown): AgentStreamEvent | null {
  if (!isRecord(payload)) return null
  const type = asString(payload.type)
  if (!type || !STREAM_EVENT_TYPES.has(type)) return null

  if (type === 'done') {
    return {
      type,
      input_tokens: asNumber(payload.input_tokens) ?? 0,
      output_tokens: asNumber(payload.output_tokens) ?? 0,
      duration_millis: asNumber(payload.duration_millis) ?? 0,
    }
  }

  if (type === 'credits_low') {
    return {
      type,
      balance: asNumber(payload.balance) ?? 0,
    }
  }

  if (type === 'tool_use') {
    const toolUse = isRecord(payload.tool_use) ? payload.tool_use : payload
    const id = asString(toolUse.id)
    const name = asString(toolUse.name)
    if (!id || !name) return null
    return {
      type,
      tool_use: {
        id,
        name,
        input: isRecord(toolUse.input) || Array.isArray(toolUse.input) ? toolUse.input : {},
      },
    }
  }

  if (type === 'tool_result') {
    const result = isRecord(payload.tool_result) ? payload.tool_result : payload
    const toolUseId = asString(result.tool_use_id)
    if (!toolUseId) return null

    return {
      type,
      tool_result: {
        tool_use_id: toolUseId,
        content: asString(result.content) ?? JSON.stringify(result.content ?? ''),
      },
    }
  }

  if (type === 'text') {
    const subtype = asString(payload.subtype)
    return {
      type,
      subtype: subtype === 'start' || subtype === 'full' || subtype === 'stop' ? subtype : 'delta',
      text: asString(payload.text) ?? undefined,
    }
  }

  if (type === 'init') {
    const init = isRecord(payload.init) ? payload.init : {}
    const sessionId = asString(init.session_id) ?? ''
    const model = asString(init.model) ?? ''
    const workingDir = asString(init.working_dir) ?? ''
    return {
      type,
      init: {
        session_id: sessionId,
        model,
        tools: asStringArray(init.tools),
        working_dir: workingDir,
      },
    }
  }

  if (type === 'thinking') {
    const thinkingRaw = isRecord(payload.thinking) ? payload.thinking : {}
    return {
      type,
      thinking: {
        summary: asString(thinkingRaw.summary) ?? undefined,
      },
    }
  }

  if (type === 'commit') {
    const commit = isRecord(payload.commit) ? payload.commit : {}
    return {
      type,
      commit: {
        checksum: asString(commit.checksum) ?? '',
        summary: asString(commit.summary) ?? '',
      },
    }
  }

  if (type === 'error') {
    return {
      type,
      error: asString(payload.error) ?? 'Unknown CLI error',
      code: asString(payload.code) ?? undefined,
    }
  }

  return { type } as AgentStreamEvent
}

export function parseAgentStopPayload(payload: unknown): { stopped: boolean } | null {
  if (!isRecord(payload)) return null

  if (typeof payload.stopped === 'boolean') {
    return { stopped: payload.stopped }
  }

  if (typeof payload.ok === 'boolean') {
    return { stopped: payload.ok }
  }

  return { stopped: true }
}

export function parseCreateProjectPayload(payload: unknown): { id: string } | null {
  if (!isRecord(payload)) return null
  const id = asString(payload.projectId ?? payload.id)
  if (!id) return null
  return { id }
}
