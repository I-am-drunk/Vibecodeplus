import { Hono } from 'hono'
import { getConfig, updateConfig } from '../state/config.ts'
import { createLogger } from '../lib/logger.ts'

const log = createLogger('settings')

export const settingsRouter = new Hono()

settingsRouter.get('/', (c) => {
  return c.json({ settings: getConfig() })
})

async function updateSettings(c: any) {
  const body = (await c.req.json()) as Record<string, unknown>
  log.info({ keys: Object.keys(body) }, 'updating settings')

  const result = updateConfig(body)
  return c.json({
    ok: true,
    settings: getConfig(),
    ...result,
  })
}

settingsRouter.patch('/', updateSettings)
settingsRouter.put('/', updateSettings)
