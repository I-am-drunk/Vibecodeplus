const BASE_WS = import.meta.env.DEV ? 'ws://localhost:3847' : `ws://${location.host}`

const connections = new Map<string, WebSocket>()

function isActive(ws: WebSocket) {
  return ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING
}

export function getProjectWS(projectId: string): WebSocket {
  const existing = connections.get(projectId)
  if (existing && isActive(existing)) {
    return existing
  }

  const ws = new WebSocket(`${BASE_WS}/ws/project/${encodeURIComponent(projectId)}`)

  ws.addEventListener('open', () => {
    ws.send(JSON.stringify({ type: 'subscribe', channels: [`project:${projectId}`] }))
  })

  ws.addEventListener('close', () => {
    const current = connections.get(projectId)
    if (current === ws) connections.delete(projectId)
  })

  connections.set(projectId, ws)
  return ws
}

export function closeProjectWS(projectId: string) {
  const ws = connections.get(projectId)
  if (!ws) return

  connections.delete(projectId)

  try {
    if (isActive(ws)) ws.close()
  } catch {
    // no-op
  }
}

export function terminalWSUrl(projectId: string): string {
  return `${BASE_WS}/ws/terminal/${encodeURIComponent(projectId)}`
}
