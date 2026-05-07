const BASE = import.meta.env.DEV ? 'http://localhost:3847' : ''

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: 'include',
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = (data as any)?.error?.message || (data as any)?.error || `HTTP ${res.status}`
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg))
  }
  return data as T
}

export const api = {
  login: (key: string) => req<{ user: any; credits: any }>('POST', '/api/auth/login', { apiKey: key }),
  me: () => req<{ authenticated: boolean; user: any; credits: any }>('GET', '/api/auth/status'),
  logout: () => req('POST', '/api/auth/logout'),

  listProjects: () => req<{ projects: any[] }>('GET', '/api/projects'),
  getProject: (id: string) => req<{ project: any }>('GET', `/api/projects/${id}`),
  createProject: (body: { name: string; description?: string; template?: string; defaultModel?: string }) =>
    req<{ project: any }>('POST', '/api/projects', body),
  deleteProject: (id: string) => req('DELETE', `/api/projects/${id}`),
  patchProject: (id: string, body: any) => req('PATCH', `/api/projects/${id}`, body),
  openWorkspace: (id: string) => req<{ ok: boolean; sandbox: any; agentUrl?: string; differentKey?: boolean; snapshotAt?: string | null }>('POST', `/api/projects/${id}/workspace`),
  closeWorkspace: (id: string) => req('DELETE', `/api/projects/${id}/workspace`).catch(() => {}),

  sendMessage: (body: any) => req<{ sessionId: string }>('POST', '/api/chat', body),
  abortChat: (projectId: string, sessionId: string) => req('POST', '/api/chat/abort', { projectId, sessionId }),
  listSessions: (projectId: string) => req<{ sessions: any[] }>('GET', `/api/chat/sessions?projectId=${projectId}`),
  getSession: (id: string) => req<{ session: any; messages: any[] }>('GET', `/api/chat/sessions/${id}`),
  deleteSession: (id: string) => req('DELETE', `/api/chat/sessions/${id}`),

  listDir: (projectId: string, path: string) =>
    req<{ entries: any[] }>('GET', `/api/files?projectId=${encodeURIComponent(projectId)}&path=${encodeURIComponent(path)}`),
  readFile: (projectId: string, path: string) =>
    fetch(`${BASE}/api/files/content?projectId=${encodeURIComponent(projectId)}&path=${encodeURIComponent(path)}`)
      .then(r => r.ok ? r.text() : r.json().then((d: any) => Promise.reject(new Error(d.error)))),
  writeFile: (projectId: string, path: string, content: string) =>
    req('PUT', '/api/files/content', { projectId, path, content }),
  mkdir: (projectId: string, path: string) => req('POST', '/api/files/mkdir', { projectId, path }),
  deleteFile: (projectId: string, path: string) => req('DELETE', '/api/files', { projectId, path }),
  renameFile: (projectId: string, from: string, to: string) => req('POST', '/api/files/rename', { projectId, from, to }),
  downloadUrl: (projectId: string, path: string) =>
    `${BASE}/api/files/download?projectId=${encodeURIComponent(projectId)}&path=${encodeURIComponent(path)}`,

  listBackups: (projectId: string) => req<{ backups: any[] }>('GET', `/api/backups/${projectId}`),
  createBackup: (projectId: string) => req<{ backup: any }>('POST', `/api/backups/${projectId}`),
  restoreBackup: (projectId: string, backupId: string) => req('POST', `/api/backups/${projectId}/restore/${backupId}`),

  startPreview: (projectId: string, remotePort: number) =>
    req<{ localPort: number; url: string }>('POST', '/api/preview/start', { projectId, remotePort }),
  stopPreview: (projectId: string) => req('DELETE', '/api/preview', { projectId }),

  getSettings: () => req<any>('GET', '/api/settings'),
  patchSettings: (body: any) => req('PATCH', '/api/settings', body),

  rotateKey: (key: string) => req<{ user: any; credits: any }>('POST', '/api/auth/rotate', { apiKey: key }),
  enactContinuation: (sourceProjectId: string) =>
    req<{ ok: boolean; newProjectId: string; name: string }>('POST', '/api/continuation/enact', { sourceProjectId }),
  captureSnapshot: (projectId: string) =>
    req<{ ok: boolean; fileCount: number }>('POST', `/api/continuation/capture/${projectId}`),
  continuationStatus: (projectId: string) =>
    req<{ snapshotAt: string | null; needsContinuation: boolean }>('GET', `/api/continuation/status/${projectId}`),
}
