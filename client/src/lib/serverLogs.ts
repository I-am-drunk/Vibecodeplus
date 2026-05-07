const BASE_WS = import.meta.env.DEV ? 'ws://localhost:3847' : `ws://${location.host}`

export interface LogEntry {
  time: number
  level: number
  component: string
  msg: string
  raw: Record<string, unknown>
}

const MAX_LOGS = 2000
const logs: LogEntry[] = []
const listeners = new Set<() => void>()

export function getLogs(): LogEntry[] { return logs }
export function clearLogs() { logs.splice(0); listeners.forEach(fn => fn()) }
export function onLogsChange(fn: () => void) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function addClientLog(component: string, msg: string, data?: Record<string, unknown>) {
  const entry: LogEntry = {
    time: Date.now(),
    level: 20, // debug level
    component: `client:${component}`,
    msg,
    raw: data ?? {},
  }
  logs.push(entry)
  if (logs.length > MAX_LOGS) logs.splice(0, logs.length - MAX_LOGS)
  listeners.forEach(fn => fn())
}

let logWs: WebSocket | null = null

export function connectServerLogs() {
  if (logWs) return
  logWs = new WebSocket(`${BASE_WS}/ws/logs`)

  logWs.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data)
      if (msg.type === 'log') {
        const entry: LogEntry = {
          time: msg.data?.time ?? Date.now(),
          level: msg.data?.level ?? 30,
          component: msg.data?.component ?? 'server',
          msg: msg.data?.msg ?? msg.message ?? '',
          raw: msg.data ?? {},
        }
        logs.push(entry)
        if (logs.length > MAX_LOGS) logs.splice(0, logs.length - MAX_LOGS)
        listeners.forEach(fn => fn())
      }
    } catch {}
  }

  logWs.onclose = () => {
    logWs = null
    setTimeout(connectServerLogs, 2000)
  }
}
