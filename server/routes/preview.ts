import { Hono } from 'hono'
import { portForwardManager } from '../ssh/tunnel.ts'
import { createLogger } from '../lib/logger.ts'

const log = createLogger('preview')

export const previewRouter = new Hono()

previewRouter.post('/start', async (c) => {
  const { projectId, remotePort } = await c.req.json<{ projectId: string; remotePort: number }>()
  if (!projectId || !remotePort) return c.json({ error: 'projectId and remotePort required' }, 400)
  log.info({ projectId, remotePort }, 'starting port forward')
  try {
    const localPort = await portForwardManager.forward(projectId, remotePort)
    log.info({ projectId, remotePort, localPort }, 'port forward started')
    return c.json({ ok: true, localPort, url: `http://localhost:${localPort}` })
  } catch (err) {
    log.error({ projectId, remotePort, err }, 'failed to start port forward')
    return c.json({ error: String(err) }, 500)
  }
})

previewRouter.delete('/', async (c) => {
  const { projectId } = await c.req.json<{ projectId: string }>()
  log.info({ projectId }, 'stopping all port forwards')
  await portForwardManager.stopAll(projectId).catch(() => {})
  log.info({ projectId }, 'port forwards stopped')
  return c.json({ ok: true })
})

previewRouter.get('/status', (c) => {
  const projectId = c.req.query('projectId')
  if (!projectId) return c.json({ error: 'projectId required' }, 400)
  const ports = portForwardManager.getForwardedPorts(projectId)
  log.debug({ projectId, active: ports.length > 0, portCount: ports.length }, 'preview status checked')
  return c.json(ports.length > 0 ? { active: true, ports } : { active: false })
})
