import pino from 'pino'
import { build as buildPretty } from 'pino-pretty'
import { existsSync, mkdirSync, createWriteStream } from 'fs'
import { join } from 'path'
import { Writable } from 'stream'
import { correlationLogBindings } from './correlation.ts'

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

const multiStream = pino.multistream([
  { stream: prettyStream, level: 'debug' },
  { stream: fileStream, level: 'trace' },
  { stream: browserStream, level: 'trace' },
])

export const logger = pino({ level: 'trace' }, multiStream)

export const addBrowserLogClient = (ws: any) => browserClients.add(ws)
export const removeBrowserLogClient = (ws: any) => browserClients.delete(ws)
export const createLogger = (component: string) => logger.child({ component })

/**
 * Create a correlation-aware logger that automatically merges
 * request_id / project_id / stream_id / migration_id from the
 * current AsyncLocalStorage context into every log entry.
 */
export function createCorrelationLogger(component: string) {
  const child = logger.child({ component })
  return {
    trace: (obj: Record<string, unknown>, msg?: string) => child.trace({ ...correlationLogBindings(), ...obj }, msg ?? ''),
    debug: (obj: Record<string, unknown>, msg?: string) => child.debug({ ...correlationLogBindings(), ...obj }, msg ?? ''),
    info: (obj: Record<string, unknown>, msg?: string) => child.info({ ...correlationLogBindings(), ...obj }, msg ?? ''),
    warn: (obj: Record<string, unknown>, msg?: string) => child.warn({ ...correlationLogBindings(), ...obj }, msg ?? ''),
    error: (obj: Record<string, unknown>, msg?: string) => child.error({ ...correlationLogBindings(), ...obj }, msg ?? ''),
    fatal: (obj: Record<string, unknown>, msg?: string) => child.fatal({ ...correlationLogBindings(), ...obj }, msg ?? ''),
  }
}
