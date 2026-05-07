import { Hono } from 'hono'
import { cli } from '../cli/wrapper.ts'
import { loadStoredAuth, storeAuth, clearAuth } from '../state/auth.ts'
import { sshManager } from '../ssh/manager.ts'
import { processRegistry } from '../process/registry.ts'
import { createLogger } from '../lib/logger.ts'

const log = createLogger('auth')

export const authRouter = new Hono()

authRouter.post('/login', async (c) => {
  const { apiKey } = await c.req.json<{ apiKey: string }>()
  log.info({ hasKey: !!apiKey, keyPrefix: apiKey?.slice(0, 15) }, 'login attempt')
  
  if (!apiKey) {
    log.warn('login failed - no API key provided')
    return c.json({ error: 'API key required' }, 400)
  }

  cli.setApiKey(apiKey)
  const result = await cli.getUser()

  if (!result.ok) {
    log.warn({ error: result.error.message }, 'login failed - invalid API key')
    cli.setApiKey('')
    return c.json({ error: result.error.message || 'Authentication failed' }, 401)
  }

  log.info({ userId: result.data.id, email: result.data.email, plan: result.data.plan }, 'login successful')
  storeAuth(apiKey, {
    id: result.data.id,
    email: result.data.email,
    name: result.data.name,
    plan: result.data.plan,
  })

  return c.json({ user: result.data, credits: result.data.credits })
})

authRouter.post('/logout', async (c) => {
  log.info('logout requested')
  clearAuth()
  cli.setApiKey('')
  processRegistry.killAll()
  await sshManager.closeAll()
  log.info('logout complete - all processes killed, SSH connections closed')
  return c.json({ ok: true })
})

authRouter.get('/status', async (c) => {
  const stored = loadStoredAuth()
  log.debug({ hasStored: !!stored }, 'checking auth status')
  
  if (!stored) {
    log.debug('no stored auth')
    return c.json({ authenticated: false })
  }

  cli.setApiKey(stored.key)
  const result = await cli.getUser()

  if (!result.ok) {
    log.warn({ error: result.error.message }, 'stored auth invalid')
    return c.json({ authenticated: false })
  }

  log.info({ userId: result.data.id, email: result.data.email }, 'auth status valid')
  return c.json({
    authenticated: true,
    user: {
      id: result.data.id,
      email: result.data.email,
      name: result.data.name,
      plan: result.data.plan,
    },
    credits: result.data.credits,
  })
})

authRouter.post('/rotate', async (c) => {
  const { apiKey } = await c.req.json<{ apiKey: string }>()
  log.info({ hasKey: !!apiKey, keyPrefix: apiKey?.slice(0, 15) }, 'API key rotation attempt')

  if (!apiKey) {
    log.warn('rotation failed - no API key provided')
    return c.json({ error: 'API key required' }, 400)
  }

  const previousKey = cli.getApiKey()

  cli.setApiKey(apiKey)
  const result = await cli.getUser()

  if (!result.ok) {
    log.warn({ error: result.error.message }, 'rotation failed - invalid new key')
    if (previousKey) cli.setApiKey(previousKey)
    return c.json({ error: result.error.message || 'Authentication failed' }, 401)
  }

  log.info({ userId: result.data.id, email: result.data.email, plan: result.data.plan }, 'API key rotated successfully')
  storeAuth(apiKey, {
    id: result.data.id,
    email: result.data.email,
    name: result.data.name,
    plan: result.data.plan,
  })

  // Close all existing SSH connections so they'll be re-established with new key
  await sshManager.closeAll()
  log.info('closed all SSH connections after key rotation')

  return c.json({ user: result.data, credits: result.data.credits })
})
