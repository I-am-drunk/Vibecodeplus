import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { which } from '../process/registry.ts'
import type {
  CLIResult, CLIError, VibecodeUser, VibecodeProject,
  SandboxCredentials, AgentStreamEvent,
} from './types.ts'

export class VibecodeCliWrapper {
  private binaryPath: string | null = null
  private apiKey: string | null = null

  async resolveBinary(override?: string): Promise<string | null> {
    const candidates = [
      override,
      process.env.VS_CLI_PATH,
      which('vibecode-cli'),
      `${process.env.HOME}/.local/bin/vibecode-cli`,
      '/usr/local/bin/vibecode-cli',
      `${process.env.HOME}/.bun/bin/vibecode-cli`,
    ].filter(Boolean) as string[]

    for (const p of candidates) {
      if (existsSync(p)) {
        this.binaryPath = p
        return p
      }
    }
    return null
  }

  getBinaryPath() { return this.binaryPath }
  setApiKey(key: string) { this.apiKey = key }
  getApiKey() { return this.apiKey }

  private getEnv(): NodeJS.ProcessEnv {
    return {
      ...process.env,
      ...(this.apiKey ? { VIBECODE_API_KEY: this.apiKey } : {}),
    }
  }

  private async runJSON<T>(args: string[], opts?: { timeout?: number; signal?: AbortSignal }): Promise<CLIResult<T>> {
    if (!this.binaryPath) return { ok: false, error: { code: 'NOT_FOUND', message: 'vibecode-cli not found' } }

    const timeout = opts?.timeout ?? 30_000
    return new Promise((resolve) => {
      const proc = spawn(this.binaryPath!, [...args, '--output', 'json'], {
        env: this.getEnv(),
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      let stdout = ''
      let stderr = ''
      const timer = setTimeout(() => { proc.kill('SIGTERM') }, timeout)

      if (opts?.signal) {
        opts.signal.addEventListener('abort', () => proc.kill('SIGTERM'))
      }

      proc.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
      proc.stderr.on('data', (d: Buffer) => { stderr += d.toString() })

      proc.on('close', (code) => {
        clearTimeout(timer)
        if (code !== 0) {
          resolve({ ok: false, error: this.parseError(code ?? 1, stdout, stderr) })
          return
        }
        try {
          resolve({ ok: true, data: JSON.parse(stdout) as T })
        } catch {
          resolve({ ok: false, error: { code: 'PARSE_ERROR', message: 'Failed to parse CLI output', stderr } })
        }
      })

      proc.on('error', (err) => {
        clearTimeout(timer)
        resolve({ ok: false, error: { code: 'UNKNOWN', message: err.message } })
      })
    })
  }

  async *runStream(args: string[], opts?: { signal?: AbortSignal }): AsyncGenerator<AgentStreamEvent> {
    if (!this.binaryPath) throw new Error('vibecode-cli not found')

    console.log('[cli] Running stream command:', this.binaryPath, args.join(' '))

    const proc = spawn(this.binaryPath, args, {
      env: this.getEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    if (opts?.signal) {
      opts.signal.addEventListener('abort', () => proc.kill('SIGTERM'))
    }

    // Capture stderr for diagnostics
    let stderrBuf = ''
    proc.stderr.on('data', (d: Buffer) => { stderrBuf += d.toString() })

    let buffer = ''
    const stream = proc.stdout
    let eventCount = 0

    for await (const chunk of stream) {
      buffer += chunk.toString()
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        try {
          const parsed = JSON.parse(trimmed)
          const event = parsed.message || parsed
          eventCount++
          console.log('[cli] Stream event:', event.type)
          yield event as AgentStreamEvent
        } catch {
          console.log('[cli] Non-JSON line:', trimmed.slice(0, 120))
        }
      }
    }

    if (buffer.trim()) {
      try {
        const parsed = JSON.parse(buffer.trim())
        const event = parsed.message || parsed
        eventCount++
        console.log('[cli] Stream event (final):', event.type)
        yield event as AgentStreamEvent
      } catch {
        console.log('[cli] Non-JSON final buffer:', buffer.trim().slice(0, 120))
      }
    }

    const exitCode = await new Promise<number>((resolve) => {
      proc.on('exit', (code) => resolve(code ?? 0))
    })

    if (stderrBuf.trim()) console.error('[cli] stderr:', stderrBuf.trim())
    console.log('[cli] Stream completed, total events:', eventCount, 'exitCode:', exitCode)
    
    if (exitCode !== 0 && eventCount === 0) {
      throw new Error(`CLI failed with exit code ${exitCode}${stderrBuf ? ': ' + stderrBuf : ''}`)
    }
  }

  async getUser(): Promise<CLIResult<VibecodeUser>> {
    const result = await this.runJSON<any>(['user'])
    if (!result.ok) return result
    // CLI returns creditBalance, but we need credits.balance
    return {
      ok: true,
      data: {
        id: result.data.id,
        email: result.data.email,
        name: `${result.data.firstName || ''} ${result.data.lastName || ''}`.trim() || result.data.email,
        plan: result.data.planTier || 'free',
        credits: {
          balance: (result.data.creditBalance || 0) / 100, // Convert cents to dollars
          used: 0,
          limit: null,
        }
      }
    }
  }

  async listProjects(): Promise<CLIResult<VibecodeProject[]>> {
    const result = await this.runJSON<{ projects: VibecodeProject[] }>(['projects', 'list'])
    if (!result.ok) return result
    return { ok: true, data: result.data?.projects || [] }
  }

  async createProject(name: string, opts?: { description?: string; template?: string }): Promise<CLIResult<VibecodeProject>> {
    const platform = opts?.template || 'webapp'
    const description = opts?.description || name
    const args = ['projects', 'create', platform, description]
    const result = await this.runJSON<any>(args)
    if (!result.ok) return result
    // CLI returns {projectId, platform, ...} but we need {id, name, ...}
    return {
      ok: true,
      data: {
        id: result.data.projectId,
        name: description,
        description: description,
        type: result.data.projectType || 'agent',
        platform: result.data.platform,
        status: 'stopped',
      } as VibecodeProject
    }
  }

  async deleteProject(projectId: string): Promise<CLIResult<{ ok: boolean }>> {
    return this.runJSON(['projects', 'delete', projectId])
  }

  async acquireSandbox(projectId: string): Promise<CLIResult<any>> {
    const result = await this.runJSON<any>(['sandboxes', 'acquire', projectId])
    if (!result.ok) return result
    // Return full response including sandbox and links (agentUrl, webappUrl, etc)
    return { ok: true, data: result.data }
  }

  async exportSandbox(projectId: string, outputPath: string): Promise<CLIResult<{ path: string }>> {
    if (!this.binaryPath) return { ok: false, error: { code: 'NOT_FOUND', message: 'vibecode-cli not found' } }
    return new Promise((resolve) => {
      const proc = spawn(this.binaryPath!, ['sandboxes', 'export', projectId, '--output', outputPath], {
        env: this.getEnv(),
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      let stderr = ''
      proc.stderr.on('data', (d: Buffer) => { stderr += d.toString() })
      proc.on('close', (code) => {
        if (code !== 0) resolve({ ok: false, error: { code: 'PROCESS_ERROR', message: stderr, exitCode: code ?? 1 } })
        else resolve({ ok: true, data: { path: outputPath } })
      })
    })
  }

  agentSend(agentUrl: string, model: string, prompt: string, opts?: { signal?: AbortSignal }) {
    // --output json must come BEFORE the positional TARGET argument
    const args = ['agent', 'send', '--model', model, '--output', 'json', agentUrl, prompt]
    return this.runStream(args, { signal: opts?.signal })
  }

  private parseError(exitCode: number, stdout: string, stderr: string): CLIError {
    const combined = (stdout + stderr).toLowerCase()
    if (combined.includes('unauthorized') || combined.includes('invalid key') || combined.includes('authentication'))
      return { code: 'AUTH_FAILED', message: 'API key is invalid or expired', stderr, exitCode }
    if (combined.includes('credits') && combined.includes('exhaust'))
      return { code: 'CREDITS_EXHAUSTED', message: 'No credits remaining', stderr, exitCode }
    if (combined.includes('network') || combined.includes('econnrefused') || combined.includes('timeout'))
      return { code: 'NETWORK_ERROR', message: 'Cannot reach Vibecode servers', stderr, exitCode }
    return { code: 'PROCESS_ERROR', message: stderr || stdout || `Process exited with code ${exitCode}`, stderr, exitCode }
  }
}

export const cli = new VibecodeCliWrapper()
