const BASE = import.meta.env.DEV ? 'http://localhost:3847' : ''

export class APIError extends Error {
  status: number
  code?: string
  details?: unknown

  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message)
    this.name = 'APIError'
    this.status = status
    this.code = code
    this.details = details
  }
}

type ErrorEnvelope = {
  ok: false
  error?: {
    code?: string
    message?: string
    details?: unknown
  }
}

type SuccessEnvelope<T> = {
  ok: true
  data: T
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isSuccessEnvelope<T>(payload: unknown): payload is SuccessEnvelope<T> {
  return isRecord(payload) && payload.ok === true && 'data' in payload
}

function isErrorEnvelope(payload: unknown): payload is ErrorEnvelope {
  return isRecord(payload) && payload.ok === false
}

function normalizeErrorPayload(payload: unknown, status: number): { message: string; code?: string; details?: unknown } {
  if (isErrorEnvelope(payload)) {
    const message = payload.error?.message || `HTTP ${status}`
    return {
      message,
      code: payload.error?.code,
      details: payload.error?.details ?? payload,
    }
  }

  if (isRecord(payload)) {
    const error = payload.error
    const nestedMessage =
      (isRecord(error) && typeof error.message === 'string' ? error.message : undefined) ||
      (typeof error === 'string' ? error : undefined) ||
      (typeof payload.message === 'string' ? payload.message : undefined) ||
      `HTTP ${status}`

    const code =
      (isRecord(error) && typeof error.code === 'string' ? error.code : undefined) ||
      (typeof payload.code === 'string' ? payload.code : undefined)

    return {
      message: nestedMessage,
      code,
      details: payload,
    }
  }

  return {
    message: `HTTP ${status}`,
    details: payload,
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'include',
  })

  const payload = await res.json().catch(() => undefined)

  if (!res.ok || isErrorEnvelope(payload)) {
    const { message, code, details } = normalizeErrorPayload(payload, res.status)
    throw new APIError(message, res.status, code, details)
  }

  if (isSuccessEnvelope<T>(payload)) {
    return payload.data
  }

  return payload as T
}

type AuthResponse = {
  user: any
  credits: any
  lowCredits?: boolean
  balanceInDollars?: number
}

type MigrationStatus = {
  id: string
  sourceProjectId: string
  targetProjectId: string | null
  status: 'pending' | 'running' | 'completed' | 'failed' | 'partial_failed'
  stage:
    | 'queued'
    | 'creating_target'
    | 'acquiring_target'
    | 'transferring_snapshot'
    | 'verifying_target'
    | 'completed'
    | 'failed'
  stageMessage: string | null
  sourcePreserved: boolean
  warning: string | null
  errorCode: string | null
  errorMessage: string | null
  startedAt: string
  updatedAt: string
  completedAt: string | null
  failedAt: string | null
}

export const api = {
  login: (key: string) => request<AuthResponse>('POST', '/api/auth/login', { apiKey: key }),
  me: () => request<{ authenticated: boolean; user?: any; credits?: any }>('GET', '/api/auth/status'),
  logout: () => request<{ ok: boolean }>('POST', '/api/auth/logout'),

  listProjects: () => request<{ projects: any[] }>('GET', '/api/projects'),
  getProject: (id: string) => request<{ project: any; canonicalProjectId?: string; mappedFromProjectId?: string | null }>('GET', `/api/projects/${id}`),
  createProject: (body: { name: string; description?: string; template?: string; defaultModel?: string }) =>
    request<{ project: any }>('POST', '/api/projects', body),
  deleteProject: (id: string) => request<{ ok: boolean }>('DELETE', `/api/projects/${id}`),
  patchProject: (id: string, body: { defaultModel: string }) => request<{ ok: boolean }>('PATCH', `/api/projects/${id}`, body),
  openWorkspace: (id: string) =>
    request<{
      ok: boolean
      sandbox?: any
      agentUrl?: string
      differentKey?: boolean
      snapshotAt?: string | null
      canonicalProjectId?: string
      mappedFromProjectId?: string | null
    }>('POST', `/api/projects/${id}/workspace`),
  closeWorkspace: (id: string) => request<{ ok: boolean }>('DELETE', `/api/projects/${id}/workspace`).catch(() => ({ ok: true })),

  sendMessage: (body: { projectId: string; model: string; prompt: string; sessionId?: string; agentUrl?: string }) =>
    request<{ sessionId: string; streamId: string; canonicalProjectId?: string }>('POST', '/api/chat', body),
  abortChat: (projectId: string, sessionId: string) =>
    request<{ ok: boolean; aborted: boolean }>('POST', '/api/chat/abort', { projectId, sessionId }),
  stopAgent: (projectId: string, sessionId: string) =>
    request<{ ok: boolean; stopped: boolean }>('POST', '/api/chat/stop', { projectId, sessionId }),
  listSessions: (projectId: string) => request<{ sessions: any[] }>('GET', `/api/chat/sessions?projectId=${encodeURIComponent(projectId)}`),
  getSession: (id: string) => request<{ session: any; messages: any[] }>('GET', `/api/chat/sessions/${id}`),
  deleteSession: (id: string) => request<{ ok: boolean }>('DELETE', `/api/chat/sessions/${id}`),

  listDir: (projectId: string, path: string) =>
    request<{ entries: any[] }>('GET', `/api/files?projectId=${encodeURIComponent(projectId)}&path=${encodeURIComponent(path)}`),
  readFile: (projectId: string, path: string) =>
    fetch(`${BASE}/api/files/content?projectId=${encodeURIComponent(projectId)}&path=${encodeURIComponent(path)}`, {
      credentials: 'include',
    }).then(async (res) => {
      if (res.ok) return res.text()
      const payload = await res.json().catch(() => undefined)
      const normalized = normalizeErrorPayload(payload, res.status)
      throw new APIError(normalized.message, res.status, normalized.code, normalized.details)
    }),
  writeFile: (projectId: string, path: string, content: string) => request<{ ok: boolean }>('PUT', '/api/files/content', { projectId, path, content }),
  mkdir: (projectId: string, path: string) => request<{ ok: boolean }>('POST', '/api/files/mkdir', { projectId, path }),
  deleteFile: (projectId: string, path: string) => request<{ ok: boolean }>('DELETE', '/api/files', { projectId, path }),
  renameFile: (projectId: string, from: string, to: string) => request<{ ok: boolean }>('POST', '/api/files/rename', { projectId, from, to }),
  downloadUrl: (projectId: string, path: string) => `${BASE}/api/files/download?projectId=${encodeURIComponent(projectId)}&path=${encodeURIComponent(path)}`,

  listBackups: (projectId: string) => request<{ backups: any[] }>('GET', `/api/backups/${projectId}`),
  createBackup: (projectId: string) => request<{ backup: any }>('POST', `/api/backups/${projectId}`),
  restoreBackup: (projectId: string, backupId: string) => request<{ ok: boolean }>('POST', `/api/backups/${projectId}/restore/${backupId}`),

  startPreview: (projectId: string, remotePort: number) => request<{ localPort: number; url: string }>('POST', '/api/preview/start', { projectId, remotePort }),
  stopPreview: (projectId: string) => request<{ ok: boolean }>('DELETE', '/api/preview', { projectId }),

  getSettings: async () => {
    const response = await request<{ settings?: any } & Record<string, any>>('GET', '/api/settings')
    return response.settings ?? response
  },
  patchSettings: async (body: Record<string, unknown>) => {
    const response = await request<{ settings?: any } & Record<string, any>>('PATCH', '/api/settings', body)
    return response.settings ?? response
  },

  rotateKey: (key: string) => request<AuthResponse>('POST', '/api/auth/rotate', { apiKey: key }),
  enactContinuation: (sourceProjectId: string) =>
    request<{ ok: boolean; migration: MigrationStatus }>('POST', '/api/continuation/enact', {
      sourceProjectId,
    }),
  migrationStatus: (migrationId: string) =>
    request<{ migration: MigrationStatus }>('GET', `/api/continuation/migrations/${encodeURIComponent(migrationId)}`),
  captureSnapshot: (projectId: string) =>
    request<{ ok: boolean; fileCount: number; canonicalProjectId?: string }>('POST', `/api/continuation/capture/${projectId}`),
  continuationStatus: (projectId: string) =>
    request<{
      snapshotAt: string | null
      snapshotDir?: string | null
      needsContinuation: boolean
      canonicalProjectId?: string
      mappedFromProjectId?: string | null
      migration?: MigrationStatus | null
    }>('GET', `/api/continuation/status/${projectId}`),
}
