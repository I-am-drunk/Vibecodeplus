import type { ServerWebSocket } from 'bun'

export type WSMessage =
  | { type: 'subscribe'; channels: string[] }
  | { type: 'unsubscribe'; channels: string[] }
  | { type: 'terminal:input'; terminalId: string; data: string }
  | { type: 'terminal:resize'; terminalId: string; cols: number; rows: number }
  | { type: 'ping' }

class WebSocketHub {
  private clients = new Set<WebSocket>()
  private subscriptions = new Map<string, Set<WebSocket>>()

  addClient(ws: WebSocket) {
    this.clients.add(ws)
  }

  removeClient(ws: WebSocket) {
    this.clients.delete(ws)
    for (const [channel, subs] of this.subscriptions) {
      subs.delete(ws)
      if (subs.size === 0) this.subscriptions.delete(channel)
    }
  }

  subscribe(ws: WebSocket, channels: string[]) {
    console.log('[hub] subscribe:', JSON.stringify(channels), 'type:', typeof channels, 'isArray:', Array.isArray(channels))
    for (const channel of channels) {
      if (!this.subscriptions.has(channel)) this.subscriptions.set(channel, new Set())
      this.subscriptions.get(channel)!.add(ws)
    }
    console.log('[hub] total subscriptions:', this.subscriptions.size, 'channels:', Array.from(this.subscriptions.keys()))
  }

  unsubscribe(ws: WebSocket, channels: string[]) {
    for (const channel of channels) {
      this.subscriptions.get(channel)?.delete(ws)
    }
  }

  broadcast(channel: string, data: Record<string, unknown>) {
    const subs = this.subscriptions.get(channel)
    console.log('[hub] broadcast to', channel, '- subscribers:', subs?.size || 0, 'event:', data.type)
    if (!subs) return
    const payload = JSON.stringify(data)
    for (const ws of subs) {
      if (ws.readyState !== WebSocket.OPEN) {
        // Prune dead connections
        subs.delete(ws)
        this.clients.delete(ws)
        continue
      }
      try { ws.send(payload) } catch { subs.delete(ws); this.clients.delete(ws) }
    }
    if (subs.size === 0) this.subscriptions.delete(channel)
  }

  broadcastAll(data: Record<string, unknown>) {
    const payload = JSON.stringify(data)
    for (const ws of this.clients) {
      try {
        if (ws.readyState === WebSocket.OPEN) ws.send(payload)
      } catch { /* ignore */ }
    }
  }

  handleMessage(ws: WebSocket, raw: string) {
    try {
      const msg = JSON.parse(raw) as WSMessage
      switch (msg.type) {
        case 'subscribe':
          this.subscribe(ws, msg.channels)
          break
        case 'unsubscribe':
          this.unsubscribe(ws, msg.channels)
          break
        case 'ping':
          ws.send(JSON.stringify({ type: 'pong' }))
          break
        case 'terminal:input':
        case 'terminal:resize':
          this.handleTerminalMessage(msg)
          break
      }
    } catch { /* malformed message */ }
  }

  private terminalHandlers = new Map<string, (msg: WSMessage) => void>()

  onTerminal(terminalId: string, handler: (msg: WSMessage) => void) {
    this.terminalHandlers.set(terminalId, handler)
    return () => { this.terminalHandlers.delete(terminalId) }
  }

  private handleTerminalMessage(msg: WSMessage) {
    if ('terminalId' in msg) {
      this.terminalHandlers.get(msg.terminalId)?.(msg)
    }
  }

  get clientCount() { return this.clients.size }
}

export const wsHub = new WebSocketHub()
