export type WSMessage =
  | { type: 'subscribe'; channels: string[] }
  | { type: 'unsubscribe'; channels: string[] }
  | { type: 'ping' }

const MAX_CHANNELS_PER_MESSAGE = 32
const MAX_CHANNEL_LENGTH = 128

function normalizeChannels(value: unknown): string[] {
  if (!Array.isArray(value)) return []

  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim().slice(0, MAX_CHANNEL_LENGTH) : ''))
    .filter(Boolean)
    .slice(0, MAX_CHANNELS_PER_MESSAGE)
}

export function parseHubControlMessage(raw: string): WSMessage | null {
  let parsed: unknown

  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return null
  }

  const msg = parsed as Record<string, unknown>
  const type = typeof msg.type === 'string' ? msg.type : ''

  if (type === 'ping') return { type: 'ping' }

  if (type === 'subscribe') {
    const channels = normalizeChannels(msg.channels)
    if (channels.length === 0) return null
    return { type: 'subscribe', channels }
  }

  if (type === 'unsubscribe') {
    const channels = normalizeChannels(msg.channels)
    if (channels.length === 0) return null
    return { type: 'unsubscribe', channels }
  }

  return null
}

class WebSocketHub {
  private clients = new Set<WebSocket>()
  private channelSubscriptions = new Map<string, Set<WebSocket>>()
  private clientSubscriptions = new Map<WebSocket, Set<string>>()

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
    for (const channel of channels) {
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
    const msg = parseHubControlMessage(raw)
    if (!msg) return

    if (msg.type === 'subscribe') {
      this.subscribe(ws, msg.channels)
      return
    }

    if (msg.type === 'unsubscribe') {
      this.unsubscribe(ws, msg.channels)
      return
    }

    if (msg.type === 'ping' && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'pong' }))
    }
  }

  get clientCount() {
    return this.clients.size
  }
}

export const wsHub = new WebSocketHub()
