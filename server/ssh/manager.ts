import { Client } from 'ssh2'
import { readFileSync } from 'fs'
import { cli } from '../cli/wrapper.ts'
import type { SandboxCredentials } from '../cli/types.ts'
import { createLogger } from '../lib/logger.ts'

const log = createLogger('ssh')

class SSHManager {
  private connections = new Map<string, Client>()
  private credentials = new Map<string, SandboxCredentials>()
  private pending = new Map<string, Promise<Client>>()

  async getConnection(projectId: string): Promise<Client> {
    log.debug({ projectId }, 'getConnection called')
    const existing = this.connections.get(projectId)
    if (existing) {
      log.debug({ projectId }, 'returning existing connection')
      return existing
    }

    // If a connection attempt is already in progress, wait for it
    const inFlight = this.pending.get(projectId)
    if (inFlight) return inFlight

    const promise = this._connect(projectId)
    this.pending.set(projectId, promise)
    try {
      const conn = await promise
      return conn
    } finally {
      this.pending.delete(projectId)
    }
  }

  private async _connect(projectId: string): Promise<Client> {
    log.debug({ projectId }, 'no existing connection, acquiring credentials')
    let creds = this.credentials.get(projectId)
    if (!creds) {
      log.debug({ projectId }, 'fetching credentials from CLI')
      const result = await cli.acquireSandbox(projectId)
      if (!result.ok) {
        log.error({ projectId, error: result.error }, 'failed to acquire sandbox credentials')
        throw new Error(result.error.message)
      }
      creds = result.data.sandbox || result.data
      this.credentials.set(projectId, creds)
      log.info({ projectId, host: (creds as any).ipv4, port: (creds as any).sshPort }, 'credentials acquired')
    }

    log.debug({ projectId }, 'creating new SSH connection')
    const conn = new Client()
    await new Promise<void>((resolve, reject) => {
      conn.on('ready', resolve)
      conn.on('error', reject)
      const config: any = {
        host: (creds as any).ipv4 || creds!.host,
        port: (creds as any).sshPort || creds!.port,
        username: (creds as any).sshUsername || creds!.user,
        keepaliveInterval: 10_000,
        keepaliveCountMax: 10,
        readyTimeout: 30_000,
      }
      if ((creds as any).sshPassword) config.password = (creds as any).sshPassword
      else if (creds!.key_path) {
        try { config.privateKey = readFileSync(creds!.key_path) } catch { config.privateKey = creds!.key_path }
      } else if ((creds as any).privateKey) config.privateKey = (creds as any).privateKey
      else return reject(new Error('No SSH credentials provided'))
      conn.connect(config)
    })

    conn.on('close', () => { this.connections.delete(projectId); this.credentials.delete(projectId) })
    conn.on('error', () => { this.connections.delete(projectId); this.credentials.delete(projectId) })
    this.connections.set(projectId, conn)
    return conn
  }

  async exec(projectId: string, command: string): Promise<string> {
    const run = async () => {
      const conn = await this.getConnection(projectId)
      return new Promise<string>((resolve, reject) => {
        conn.exec(command, (err, stream) => {
          if (err) return reject(err)
          let stdout = ''
          let stderr = ''
          stream.on('data', (d: Buffer) => { stdout += d.toString() })
          stream.stderr.on('data', (d: Buffer) => { stderr += d.toString() })
          stream.on('close', (code: number) => {
            if (code !== 0 && stderr) reject(new Error(`Exit ${code}: ${stderr}`))
            else resolve(stdout)
          })
        })
      })
    }
    try {
      return await run()
    } catch (err) {
      // Stale connection — clear and retry once
      this.connections.delete(projectId)
      return run()
    }
  }

  async getSFTP(projectId: string) {
    const conn = await this.getConnection(projectId)
    return new Promise<any>((resolve, reject) => {
      conn.sftp((err, sftp) => {
        if (err) reject(err)
        else resolve(sftp)
      })
    })
  }

  isConnected(projectId: string): boolean {
    return this.connections.has(projectId)
  }

  async disconnect(projectId: string) {
    const conn = this.connections.get(projectId)
    if (conn) {
      conn.end()
      this.connections.delete(projectId)
      this.credentials.delete(projectId)
    }
  }

  async closeAll() {
    for (const [id, conn] of this.connections) {
      conn.end()
    }
    this.connections.clear()
    this.credentials.clear()
  }
}

export const sshManager = new SSHManager()
