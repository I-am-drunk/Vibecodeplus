import { Client, type ConnectConfig } from 'ssh2'
import { readFileSync } from 'fs'
import { cli } from '../cli/wrapper.ts'
import type { SandboxCredentials } from '../cli/types.ts'
import { createLogger } from '../lib/logger.ts'

const log = createLogger('ssh')

type NormalizedCredentials = {
  host: string
  port: number
  username: string
  password?: string
  privateKey?: string | Buffer
}

type FailureState = {
  count: number
  lastError: string
  lastAt: number
}

const MAX_CONSECUTIVE_FAILURES = 3
const BACKOFF_WINDOW_MS = 5 * 60 * 1000

function normalizeSandboxCredentials(input: SandboxCredentials | Record<string, unknown>): NormalizedCredentials {
  const host = String((input as any).host ?? (input as any).ipv4 ?? '').trim()
  const port = Number((input as any).port ?? (input as any).sshPort ?? 22)
  const username = String((input as any).user ?? (input as any).sshUsername ?? 'user').trim()

  const password = (input as any).password ?? (input as any).sshPassword
  let privateKey: string | Buffer | undefined

  const keyPath = (input as any).key_path
  if (keyPath) {
    try {
      privateKey = readFileSync(keyPath)
    } catch {
      privateKey = String(keyPath)
    }
  }

  if (!privateKey && (input as any).privateKey) {
    privateKey = (input as any).privateKey as string
  }

  if (!host || !Number.isFinite(port) || !username) {
    throw new Error('Sandbox credentials are incomplete')
  }

  return {
    host,
    port,
    username,
    password: password ? String(password) : undefined,
    privateKey,
  }
}

function isLikelyAuthError(message: string) {
  const value = message.toLowerCase()
  return value.includes('auth') || value.includes('permission denied') || value.includes('forbidden')
}

class SSHManager {
  private connections = new Map<string, Client>()
  private credentials = new Map<string, NormalizedCredentials>()
  private pending = new Map<string, Promise<Client>>()
  private pendingCredentialRefresh = new Map<string, Promise<NormalizedCredentials>>()
  private failures = new Map<string, FailureState>()
  private leaseCounters = new Map<string, number>()
  private activeLeases = new Map<string, number>()

  primeCredentials(projectId: string, rawCredentials: SandboxCredentials | Record<string, unknown>) {
    try {
      this.credentials.set(projectId, normalizeSandboxCredentials(rawCredentials))
      this.pendingCredentialRefresh.delete(projectId)
      this.failures.delete(projectId)
    } catch (err) {
      log.warn({ projectId, error: String(err) }, 'failed to prime SSH credentials')
    }
  }

  isConnected(projectId: string): boolean {
    return this.connections.has(projectId)
  }

  getLeaseId(projectId: string): number | null {
    const lease = this.activeLeases.get(projectId)
    return typeof lease === 'number' ? lease : null
  }

  async getConnection(projectId: string): Promise<Client> {
    const existing = this.connections.get(projectId)
    if (existing) return existing

    const failure = this.failures.get(projectId)
    if (failure && failure.count >= MAX_CONSECUTIVE_FAILURES && Date.now() - failure.lastAt < BACKOFF_WINDOW_MS) {
      throw new Error('Too many failed SSH attempts. Please wait before retrying.')
    }

    const pending = this.pending.get(projectId)
    if (pending) return pending

    const connectionPromise = this.connectWithRecovery(projectId)
    this.pending.set(projectId, connectionPromise)

    try {
      const conn = await connectionPromise
      this.failures.delete(projectId)
      return conn
    } catch (err) {
      this.recordFailure(projectId, err)
      throw err
    } finally {
      this.pending.delete(projectId)
    }
  }

  async exec(projectId: string, command: string): Promise<string> {
    const run = async () => {
      const conn = await this.getConnection(projectId)
      return await new Promise<string>((resolve, reject) => {
        conn.exec(command, (err, stream) => {
          if (err) return reject(err)

          let stdout = ''
          let stderr = ''

          stream.on('data', (chunk: Buffer) => {
            stdout += chunk.toString()
          })

          stream.stderr.on('data', (chunk: Buffer) => {
            stderr += chunk.toString()
          })

          stream.on('close', (code: number) => {
            if (code !== 0 && stderr.trim()) {
              reject(new Error(stderr.trim()))
              return
            }
            resolve(stdout)
          })
        })
      })
    }

    try {
      return await run()
    } catch (err) {
      this.clearConnection(projectId)
      return run()
    }
  }

  async getSFTP(projectId: string) {
    const conn = await this.getConnection(projectId)
    return await new Promise<any>((resolve, reject) => {
      conn.sftp((err, sftp) => {
        if (err) reject(err)
        else resolve(sftp)
      })
    })
  }

  async disconnect(projectId: string) {
    this.clearConnection(projectId)
    this.credentials.delete(projectId)
    this.pending.delete(projectId)
    this.pendingCredentialRefresh.delete(projectId)
    this.activeLeases.delete(projectId)
  }

  async closeConnection(projectId: string) {
    await this.disconnect(projectId)
  }

  async closeAll() {
    for (const projectId of [...this.connections.keys()]) {
      this.clearConnection(projectId)
    }
    this.credentials.clear()
    this.pending.clear()
    this.pendingCredentialRefresh.clear()
    this.failures.clear()
    this.activeLeases.clear()
  }

  private async connectWithRecovery(projectId: string): Promise<Client> {
    const firstAttempt = await this.connect(projectId, false)
    if (firstAttempt.ok) return firstAttempt.connection

    const firstMessage = firstAttempt.error instanceof Error ? firstAttempt.error.message : String(firstAttempt.error)
    if (!isLikelyAuthError(firstMessage)) {
      throw firstAttempt.error
    }

    log.warn({ projectId }, 'SSH auth failed, refreshing sandbox credentials and retrying once')
    this.credentials.delete(projectId)

    const secondAttempt = await this.connect(projectId, true)
    if (secondAttempt.ok) return secondAttempt.connection
    throw secondAttempt.error
  }

  private async connect(
    projectId: string,
    forceRefreshCredentials: boolean,
  ): Promise<{ ok: true; connection: Client } | { ok: false; error: unknown }> {
    try {
      const credentials = await this.resolveCredentials(projectId, forceRefreshCredentials)
      const connection = await this.openClient(projectId, credentials)
      this.connections.set(projectId, connection)
      return { ok: true, connection }
    } catch (error) {
      return { ok: false, error }
    }
  }

  private async resolveCredentials(projectId: string, forceRefresh = false): Promise<NormalizedCredentials> {
    if (!forceRefresh) {
      const cached = this.credentials.get(projectId)
      if (cached) return cached
    }

    const pendingRefresh = this.pendingCredentialRefresh.get(projectId)
    if (pendingRefresh) {
      return pendingRefresh
    }

    const refreshPromise = (async () => {
      const result = await cli.acquireSandbox(projectId)
      if (!result.ok) {
        throw new Error(result.error.message || 'Failed to acquire sandbox credentials')
      }

      const rawCreds = result.data.sandbox ?? result.data
      const creds = normalizeSandboxCredentials(rawCreds)
      this.credentials.set(projectId, creds)
      return creds
    })().finally(() => {
      this.pendingCredentialRefresh.delete(projectId)
    })

    this.pendingCredentialRefresh.set(projectId, refreshPromise)
    return refreshPromise
  }

  private nextLeaseId(projectId: string): number {
    const next = (this.leaseCounters.get(projectId) ?? 0) + 1
    this.leaseCounters.set(projectId, next)
    this.activeLeases.set(projectId, next)
    return next
  }

  private async openClient(projectId: string, credentials: NormalizedCredentials): Promise<Client> {
    const conn = new Client()
    const leaseId = this.nextLeaseId(projectId)

    await new Promise<void>((resolve, reject) => {
      const config: ConnectConfig = {
        host: credentials.host,
        port: credentials.port,
        username: credentials.username,
        keepaliveInterval: 10_000,
        keepaliveCountMax: 10,
        readyTimeout: 30_000,
      }

      if (credentials.password) {
        config.password = credentials.password
      } else if (credentials.privateKey) {
        config.privateKey = credentials.privateKey
      } else {
        reject(new Error('No SSH auth method available for sandbox'))
        return
      }

      conn.once('ready', () => resolve())
      conn.once('error', (err) => reject(err))
      conn.connect(config)
    })

    conn.on('close', () => this.clearConnection(projectId, leaseId))
    conn.on('error', () => this.clearConnection(projectId, leaseId))

    log.info(
      {
        projectId,
        leaseId,
        host: credentials.host,
        port: credentials.port,
      },
      'SSH connected',
    )

    return conn
  }

  private clearConnection(projectId: string, leaseId?: number) {
    const activeLease = this.activeLeases.get(projectId)
    if (typeof leaseId === 'number' && typeof activeLease === 'number' && leaseId !== activeLease) {
      return
    }

    const conn = this.connections.get(projectId)
    if (!conn) return

    try {
      conn.end()
    } catch {
      // ignore
    }

    this.connections.delete(projectId)
    this.activeLeases.delete(projectId)
  }

  private recordFailure(projectId: string, error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    const previous = this.failures.get(projectId)

    const state: FailureState = {
      count: (previous?.count ?? 0) + 1,
      lastError: message,
      lastAt: Date.now(),
    }
    this.failures.set(projectId, state)

    if (state.count <= 3 || state.count % 3 === 0 || state.lastError !== previous?.lastError) {
      log.warn({ projectId, attempts: state.count, message }, 'SSH connection failed')
    }
  }
}

export const sshManager = new SSHManager()
