const BASE_WS = import.meta.env.DEV ? 'ws://localhost:3847' : `ws://${location.host}`

const connections = new Map<string, WebSocket>()

export function getProjectWS(projectId: string): WebSocket {
  const existing = connections.get(projectId)
  if (existing && existing.readyState <= WebSocket.OPEN) return existing

  const ws = new WebSocket(`${BASE_WS}/ws/project/${encodeURIComponent(projectId)}`)
  
  ws.addEventListener('open', () => {
    console.log(`[ws] connected for project ${projectId}, subscribing...`)
    ws.send(JSON.stringify({ type: 'subscribe', channels: [`project:${projectId}`] }))
  })
  
  connections.set(projectId, ws)
  return ws
}

export function closeProjectWS(projectId: string) {
  const ws = connections.get(projectId)
  if (ws) {
    ws.close()
    connections.delete(projectId)
    console.log(`[ws] closed for project ${projectId}`)
  }
}

export function terminalWSUrl(projectId: string): string {
  return `${BASE_WS}/ws/terminal/${encodeURIComponent(projectId)}`
}
