import { parseInboundWSMessage } from '../contracts/events.ts'

export type WSMessage =
  | { type: 'subscribe'; channels: string[] }
  | { type: 'unsubscribe'; channels: string[] }
  | { type: 'ping' }

class WebSocketHub {
  private clients = new Set<WebSocket>()
  private channelSubscriptions = new Map<string, Set<WebSocket>>()
  private clientSubscriptions = new Map<WebSocket, Set<string>>()
  private static MAX_CHANNELS_PER_CLIENT = 100
  private static MAX_CHANNEL_LENGTH = 256

  addClient(ws: WebSocket) {
    this.clients.add(ws)
    if (!this.clientSubscriptions.has(ws)) this.clientSubscriptions.set(ws, new Set())
  }

  removeClient(ws: WebSocket) {
    const channels = this.clientSubscriptions.get(ws)
    if (channels) {
      for (const channel of channels) {
        const subs = this.channelSubscriptions.get(channel)
        if (!subs) continue
        subs.delete(ws)
        if (subs.size === 0) this.channelSubscriptions.delete(channel)
      }
    }
    this.clientSubscriptions.delete(ws)
    this.clients.delete(ws)
  }

  subscribe(ws: WebSocket, channels: string[]) {
    this.addClient(ws)

    const ownedChannels = this.clientSubscriptions.get(ws)!
    const remaining = WebSocketHub.MAX_CHANNELS_PER_CLIENT - ownedChannels.size
    const toAdd = channels.slice(0, remaining)

    for (const channel of toAdd) {
      if (channel.length > WebSocketHub.MAX_CHANNEL_LENGTH) continue
      if (!this.channelSubscriptions.has(channel)) this.channelSubscriptions.set(channel, new Set())
      this.channelSubscriptions.get(channel)!.add(ws)
      ownedChannels.add(channel)
    }
  }

  unsubscribe(ws: WebSocket, channels: string[]) {
    const ownedChannels = this.clientSubscriptions.get(ws)
    for (const channel of channels) {
      this.channelSubscriptions.get(channel)?.delete(ws)
      if (this.channelSubscriptions.get(channel)?.size === 0) {
        this.channelSubscriptions.delete(channel)
      }
      ownedChannels?.delete(channel)
    }
  }

  broadcast(channel: string, data: Record<string, unknown>) {
    const subscribers = this.channelSubscriptions.get(channel)
    if (!subscribers || subscribers.size === 0) return

    const payload = JSON.stringify(data)

    for (const ws of [...subscribers]) {
      if (ws.readyState !== WebSocket.OPEN) {
        this.removeClient(ws)
        continue
      }

      try {
        ws.send(payload)
      } catch {
        this.removeClient(ws)
      }
    }
  }

  broadcastAll(data: Record<string, unknown>) {
    const payload = JSON.stringify(data)
    for (const ws of [...this.clients]) {
      if (ws.readyState !== WebSocket.OPEN) {
        this.removeClient(ws)
        continue
      }

      try {
        ws.send(payload)
      } catch {
        this.removeClient(ws)
      }
    }
  }

  handleMessage(ws: WebSocket, raw: string) {
    try {
      const parsed = JSON.parse(raw)
      const msg = parseInboundWSMessage(parsed)
      if (!msg) return

      if (msg.type === 'subscribe') {
        const channels = msg.channels.map((c) => c.trim()).filter(Boolean)
        if (channels.length > 0) this.subscribe(ws, channels)
      }

      if (msg.type === 'unsubscribe') {
        const channels = msg.channels.map((c) => c.trim()).filter(Boolean)
        if (channels.length > 0) this.unsubscribe(ws, channels)
      }

      if (msg.type === 'ping' && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'pong' }))
      }
    } catch {
      // malformed message
    }
  }

  get clientCount() {
    return this.clients.size
  }
}

export const wsHub = new WebSocketHub()
