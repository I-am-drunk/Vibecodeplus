import pino from 'pino'
import { build as buildPretty } from 'pino-pretty'
import { existsSync, mkdirSync, createWriteStream } from 'fs'
import { join } from 'path'
import { Writable } from 'stream'

const logsDir = join(process.cwd(), 'logs')
if (!existsSync(logsDir)) mkdirSync(logsDir, { recursive: true })

const browserClients = new Set<any>()

// Forwards raw JSON log lines to connected browser WebSocket clients
const browserStream = new Writable({
  write(chunk: Buffer, _enc, cb) {
    const line = chunk.toString().trim()
    if (!line) return cb()
    try {
      const log = JSON.parse(line)
      const payload = JSON.stringify({ type: 'log', level: log.level, message: log.msg, data: log })
      for (const ws of browserClients) {
        try { ws.send(payload) } catch {}
      }
    } catch {}
    cb()
  }
})

const prettyStream = buildPretty({ colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' })
const fileStream = createWriteStream(join(logsDir, 'app.log'), { flags: 'a' })

const defaultLevel = process.env.VS_LOG_LEVEL ?? 'info'
const consoleLevel = process.env.VS_CONSOLE_LOG_LEVEL ?? (process.env.NODE_ENV === 'development' ? 'info' : 'warn')

const multiStream = pino.multistream([
  { stream: prettyStream, level: consoleLevel },
  { stream: fileStream, level: defaultLevel },
  { stream: browserStream, level: defaultLevel },
])

export const logger = pino({ level: defaultLevel }, multiStream)

export const addBrowserLogClient = (ws: any) => browserClients.add(ws)
export const removeBrowserLogClient = (ws: any) => browserClients.delete(ws)
export const createLogger = (component: string) => logger.child({ component })
