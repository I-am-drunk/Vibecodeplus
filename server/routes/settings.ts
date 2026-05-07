import { Hono } from 'hono'
import { getConfig, updateConfig } from '../state/config.ts'
import { createLogger } from '../lib/logger.ts'

const log = createLogger('settings')

export const settingsRouter = new Hono()

settingsRouter.get('/', (c) => {
  const settings = getConfig()
  log.debug({ settings }, 'settings retrieved')
  return c.json({ settings })
})

settingsRouter.put('/', async (c) => {
  const body = await c.req.json()
  log.info({ updates: Object.keys(body) }, 'updating settings')
  const result = updateConfig(body)
  const settings = getConfig()
  log.info({ result, settings }, 'settings updated')
  return c.json({ ok: true, settings, ...result })
})
