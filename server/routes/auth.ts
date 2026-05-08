import { Hono } from 'hono'
import { cli } from '../cli/wrapper.ts'
import { loadStoredAuth, storeAuth, clearAuth } from '../state/auth.ts'
import { sshManager } from '../ssh/manager.ts'
import { processRegistry } from '../process/registry.ts'
import { streamRegistry } from '../state/streams.ts'
import { createLogger } from '../lib/logger.ts'

const log = createLogger('auth')

export const authRouter = new Hono()

type LoginBody = { apiKey?: string }

function formatAuthResponse(user: any) {
  const credits = user.credits || { balance: 0, used: 0, limit: null }
  const balanceInDollars = Number(credits.balance || 0)
  const lowCredits = balanceInDollars < 1

  return {
    user,
    credits,
    lowCredits,
    balanceInDollars,
  }
}

async function validateApiKey(apiKey: string) {
  cli.setApiKey(apiKey)
  const result = await cli.getUser()
  if (!result.ok) {
    cli.setApiKey('')
    throw new Error(result.error.message || 'Authentication failed')
  }

  const response = formatAuthResponse(result.data)
  if (response.credits.balance <= 0) {
    cli.setApiKey('')
    const err = new Error('This API key has zero credits. Please add credits at vibecode.dev/payments before using it.')
    ;(err as any).code = 'ZERO_CREDITS'
    throw err
  }

  return response
}

authRouter.post('/login', async (c) => {
  const { apiKey } = await c.req.json<LoginBody>()

  if (!apiKey?.trim()) {
    return c.json({ error: 'API key required' }, 400)
  }

  try {
    const response = await validateApiKey(apiKey.trim())

    storeAuth(apiKey.trim(), {
      id: response.user.id,
      email: response.user.email,
      name: response.user.name,
      plan: response.user.plan,
    })

    return c.json(response)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const code = (err as any)?.code
    const status = code === 'ZERO_CREDITS' ? 402 : 401

    log.warn({ message, code }, 'login failed')
    return c.json({ error: message, code }, status)
  }
})

authRouter.post('/logout', async (c) => {
  clearAuth()
  cli.setApiKey('')
  processRegistry.killAll()
  streamRegistry.abortAll('logout')
  await sshManager.closeAll()
  return c.json({ ok: true })
})

authRouter.get('/status', async (c) => {
  const stored = loadStoredAuth()
  if (!stored?.key) {
    return c.json({ authenticated: false })
  }

  cli.setApiKey(stored.key)
  const result = await cli.getUser()

  if (!result.ok) {
    clearAuth()
    cli.setApiKey('')
    return c.json({ authenticated: false })
  }

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
  const { apiKey } = await c.req.json<LoginBody>()
  if (!apiKey?.trim()) {
    return c.json({ error: 'API key required' }, 400)
  }

  const nextKey = apiKey.trim()
  const previous = loadStoredAuth()?.key ?? cli.getApiKey() ?? ''

  if (previous && previous === nextKey) {
    return c.json(
      {
        error: 'This is the same API key you are already using. Please enter a different key with available credits.',
        code: 'SAME_KEY',
      },
      400,
    )
  }

  try {
    const response = await validateApiKey(nextKey)

    storeAuth(nextKey, {
      id: response.user.id,
      email: response.user.email,
      name: response.user.name,
      plan: response.user.plan,
    })

    streamRegistry.abortAll('api key rotated')
    await sshManager.closeAll()

    return c.json(response)
  } catch (err) {
    if (previous) cli.setApiKey(previous)

    const message = err instanceof Error ? err.message : String(err)
    const code = (err as any)?.code
    const status = code === 'ZERO_CREDITS' ? 402 : 401

    log.warn({ message, code }, 'key rotation failed')
    return c.json({ error: message, code }, status)
  }
})

authRouter.get('/credits', async (c) => {
  const stored = loadStoredAuth()
  if (!stored?.key) return c.json({ error: 'Not authenticated' }, 401)

  cli.setApiKey(stored.key)
  const result = await cli.getUser()
  if (!result.ok) {
    return c.json({ error: result.error.message || 'Failed to fetch credits' }, 500)
  }

  return c.json({ credits: result.data.credits })
})
