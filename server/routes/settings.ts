import { Hono } from 'hono'
import { getConfig, updateConfig } from '../state/config.ts'
import { createLogger } from '../lib/logger.ts'
import { readBody } from '../contracts/routes.ts'
import { jsonError, success, invalidJson } from '../lib/errors.ts'

const log = createLogger('settings')

export const settingsRouter = new Hono()

settingsRouter.get('/', (c) => {
  return c.json(success({ settings: getConfig() }))
})

async function updateSettings(c: any) {
  try {
    const body = await readBody(c) as Record<string, unknown>
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw invalidJson({ reason: 'Request body must be a JSON object' })
    }

    log.info({ keys: Object.keys(body) }, 'updating settings')

    const result = updateConfig(body)
    return c.json(success({
      settings: getConfig(),
      ...result,
    }))
  } catch (error) {
    return jsonError(c, error)
  }
}

settingsRouter.patch('/', updateSettings)
settingsRouter.put('/', updateSettings)
