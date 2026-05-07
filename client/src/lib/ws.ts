const BASE_WS = import.meta.env.DEV ? 'ws://localhost:3847' : `ws://${location.host}`

const connections = new Map<string, WebSocket>()
const reconnectTimers = new Map<string, number>()

export function getProjectWS(projectId: string): WebSocket {
  const existing = connections.get(projectId)
  if (existing && existing.readyState <= WebSocket.OPEN) return existing

  const ws = new WebSocket(`${BASE_WS}/ws/project/${encodeURIComponent(projectId)}`)
  
  ws.addEventListener('open', () => {
    console.log(`[ws] connected for project ${projectId}, subscribing...`)
    ws.send(JSON.stringify({ type: 'subscribe', channels: [`project:${projectId}`] }))
    // Clear any reconnect timer
    const timer = reconnectTimers.get(projectId)
    if (timer) {
      clearTimeout(timer)
      reconnectTimers.delete(projectId)
    }
  })
  
  ws.addEventListener('close', () => {
    console.log(`[ws] connection closed for project ${projectId}, will reconnect in 2s`)
    connections.delete(projectId)
    // Auto-reconnect after 2 seconds
    const timer = window.setTimeout(() => {
      console.log(`[ws] reconnecting for project ${projectId}`)
      getProjectWS(projectId)
    }, 2000)
    reconnectTimers.set(projectId, timer)
  })
  
  ws.addEventListener('error', (err) => {
    console.error(`[ws] error for project ${projectId}:`, err)
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
  // Clear any pending reconnect
  const timer = reconnectTimers.get(projectId)
  if (timer) {
    clearTimeout(timer)
    reconnectTimers.delete(projectId)
  }
}

export function terminalWSUrl(projectId: string): string {
  return `${BASE_WS}/ws/terminal/${encodeURIComponent(projectId)}`
}
