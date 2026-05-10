import { Hono } from 'hono'
import { cli } from '../cli/wrapper.ts'
import { loadStoredAuth, storeAuth, clearAuth } from '../state/auth.ts'
import { sshManager } from '../ssh/manager.ts'
import { processRegistry } from '../process/registry.ts'
import { streamRegistry } from '../state/streams.ts'
import { createLogger } from '../lib/logger.ts'
import { jsonError, success, AppError, unauthorized, badRequest, forbidden } from '../lib/errors.ts'
import { parseLoginRequest, readBody } from '../contracts/routes.ts'
import { agentUrls } from '../state/agents.ts'
import { fileWatcher } from '../ssh/watcher.ts'
import { mapGetUserFailure } from '../lib/errors.ts'

const log = createLogger('auth')

export const authRouter = new Hono()

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
    throw mapGetUserFailure(result.error)
  }

  const response = formatAuthResponse(result.data)
  if (response.credits.balance <= 0) {
    cli.setApiKey('')
    throw new AppError(
      'CREDITS_EXHAUSTED',
      'This API key has zero credits. Please add credits at vibecode.dev/payments before using it.',
      402,
    )
  }

  return response
}

authRouter.post('/login', async (c) => {
  try {
    const { apiKey } = await parseLoginRequest(await readBody(c))

    const response = await validateApiKey(apiKey)

    storeAuth(apiKey, {
      id: response.user.id,
      email: response.user.email,
      name: response.user.name,
      plan: response.user.plan,
    })

    return c.json(success(response))
  } catch (error) {
    log.warn({ error: String(error) }, 'login failed')
    return jsonError(c, error)
  }
})

authRouter.post('/logout', async (c) => {
  try {
    clearAuth()
    cli.setApiKey('')
    processRegistry.killAll()
    streamRegistry.abortAll('logout')
    fileWatcher.stop()
    await sshManager.closeAll()
    agentUrls.clear()
    return c.json(success({ ok: true }))
  } catch (error) {
    return jsonError(c, error)
  }
})

authRouter.get('/status', async (c) => {
  try {
    const stored = loadStoredAuth()
    if (!stored?.key) {
      return c.json(success({ authenticated: false }))
    }

    cli.setApiKey(stored.key)
    const result = await cli.getUser()

    if (!result.ok) {
      clearAuth()
      cli.setApiKey('')
      return c.json(success({ authenticated: false }))
    }

    return c.json(
      success({
        authenticated: true,
        user: {
          id: result.data.id,
          email: result.data.email,
          name: result.data.name,
          plan: result.data.plan,
        },
        credits: result.data.credits,
      }),
    )
  } catch (error) {
    return jsonError(c, error)
  }
})

authRouter.post('/rotate', async (c) => {
  try {
    const { apiKey } = await parseLoginRequest(await readBody(c))

    const nextKey = apiKey
    const previous = loadStoredAuth()?.key ?? cli.getApiKey() ?? ''

    if (previous && previous === nextKey) {
      throw badRequest('This is the same API key you are already using. Please enter a different key with available credits.')
    }

    const response = await validateApiKey(nextKey)

    storeAuth(nextKey, {
      id: response.user.id,
      email: response.user.email,
      name: response.user.name,
      plan: response.user.plan,
    })

    streamRegistry.abortAll('api key rotated')
    await sshManager.closeAll()
    agentUrls.clear()

    return c.json(success(response))
  } catch (error) {
    const previous = loadStoredAuth()?.key
    if (previous) cli.setApiKey(previous)

    log.warn({ error: String(error) }, 'key rotation failed')
    return jsonError(c, error)
  }
})

authRouter.get('/credits', async (c) => {
  try {
    const stored = loadStoredAuth()
    if (!stored?.key) throw unauthorized('Not authenticated')

    cli.setApiKey(stored.key)
    const result = await cli.getUser()
    if (!result.ok) {
      if (result.error.code === 'AUTH_FAILED') {
        clearAuth()
        cli.setApiKey('')
        throw unauthorized('Not authenticated')
      }
      if (result.error.code === 'CREDITS_EXHAUSTED') {
        return c.json(success({ credits: { balance: 0, used: 0, limit: null } }))
      }
      throw new AppError('DEPENDENCY_ERROR', result.error.message || 'Failed to fetch credits', 502)
    }

    return c.json(success({ credits: result.data.credits }))
  } catch (error) {
    return jsonError(c, error)
  }
})
