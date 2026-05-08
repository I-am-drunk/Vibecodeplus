import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { which } from '../process/registry.ts'
import type { CLIResult, CLIError, VibecodeUser, VibecodeProject, AgentStreamEvent } from './types.ts'
import { createLogger } from '../lib/logger.ts'
import {
  parseAcquireSandboxPayload,
  parseAgentStopPayload,
  parseAgentStreamEvent,
  parseCliProjectsPayload,
  parseCliUserPayload,
} from '../contracts/cli.ts'

const log = createLogger('cli')

function parseFirstJson(text: string): unknown | null {
  const trimmed = text.trim()
  if (!trimmed) return null

  try {
    return JSON.parse(trimmed)
  } catch {
    // continue
  }

  const lines = trimmed
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  for (const line of lines.reverse()) {
    try {
      return JSON.parse(line)
    } catch {
      // continue
    }
  }

  return null
}

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

    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        this.binaryPath = candidate
        return candidate
      }
    }

    return null
  }

  getBinaryPath() {
    return this.binaryPath
  }

  setApiKey(key: string) {
    this.apiKey = key
  }

  getApiKey() {
    return this.apiKey
  }

  private getEnv(): NodeJS.ProcessEnv {
    return {
      ...process.env,
      ...(this.apiKey ? { VIBECODE_API_KEY: this.apiKey } : {}),
    }
  }

  private async runJSON<T>(args: string[], opts?: { timeout?: number; signal?: AbortSignal }): Promise<CLIResult<T>> {
    if (!this.binaryPath) {
      return { ok: false, error: { code: 'NOT_FOUND', message: 'vibecode-cli not found' } }
    }

    const timeoutMs = opts?.timeout ?? 30_000
    const finalArgs = args.includes('--output') ? [...args] : [...args, '--output', 'json']

    return await new Promise((resolve) => {
      const proc = spawn(this.binaryPath!, finalArgs, {
        env: this.getEnv(),
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      let stdout = ''
      let stderr = ''
      let timedOut = false

      const onAbort = () => proc.kill('SIGTERM')
      opts?.signal?.addEventListener('abort', onAbort)

      const timer = setTimeout(() => {
        timedOut = true
        proc.kill('SIGTERM')
      }, timeoutMs)

      proc.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString()
      })

      proc.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString()
      })

      proc.on('close', (code) => {
        clearTimeout(timer)
        opts?.signal?.removeEventListener('abort', onAbort)

        if (timedOut) {
          resolve({
            ok: false,
            error: {
              code: 'TIMEOUT',
              message: 'CLI command timed out',
              stderr,
              exitCode: code ?? 124,
            },
          })
          return
        }

        if (code !== 0) {
          resolve({ ok: false, error: this.parseError(code ?? 1, stdout, stderr) })
          return
        }

        const parsed = parseFirstJson(stdout)
        if (!parsed) {
          resolve({
            ok: false,
            error: {
              code: 'PARSE_ERROR',
              message: 'Failed to parse CLI output',
              stderr,
              exitCode: code ?? 0,
            },
          })
          return
        }

        resolve({ ok: true, data: parsed as T })
      })

      proc.on('error', (err) => {
        clearTimeout(timer)
        opts?.signal?.removeEventListener('abort', onAbort)

        resolve({
          ok: false,
          error: {
            code: 'UNKNOWN',
            message: err.message,
          },
        })
      })
    })
  }

  async *runStream(args: string[], opts?: { signal?: AbortSignal }): AsyncGenerator<AgentStreamEvent> {
    if (!this.binaryPath) throw new Error('vibecode-cli not found')

    const proc = spawn(this.binaryPath, args, {
      env: this.getEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stderrBuffer = ''
    let stdoutBuffer = ''

    const onAbort = () => proc.kill('SIGTERM')
    opts?.signal?.addEventListener('abort', onAbort)

    proc.stderr.on('data', (chunk: Buffer) => {
      stderrBuffer += chunk.toString()
    })

    for await (const chunk of proc.stdout) {
      stdoutBuffer += chunk.toString()
      const lines = stdoutBuffer.split('\n')
      stdoutBuffer = lines.pop() ?? ''

      for (const raw of lines) {
        const line = raw.trim()
        if (!line) continue

        const payload = line.startsWith('data:') ? line.slice(5).trim() : line
        if (!payload || payload === '[DONE]') continue

        try {
          const parsed = JSON.parse(payload)
          const event = parseAgentStreamEvent(parsed.message ?? parsed)
          if (event) {
            yield event
          }
        } catch {
          // ignore non-json line
        }
      }
    }

    if (stdoutBuffer.trim()) {
      try {
        const parsed = JSON.parse(stdoutBuffer.trim())
        const event = parseAgentStreamEvent((parsed as any).message ?? parsed)
        if (event) yield event
      } catch {
        // ignore trailing non-json
      }
    }

    const exitCode = await new Promise<number>((resolve) => {
      proc.on('exit', (code) => resolve(code ?? 0))
    })

    opts?.signal?.removeEventListener('abort', onAbort)

    if (exitCode !== 0) {
      throw new Error(stderrBuffer.trim() || `CLI exited with code ${exitCode}`)
    }

    if (stderrBuffer.trim()) {
      log.debug({ stderr: stderrBuffer.trim() }, 'cli stream stderr')
    }
  }

  async getUser(): Promise<CLIResult<VibecodeUser>> {
    const result = await this.runJSON<unknown>(['user'])
    if (!result.ok) return result

    const parsed = parseCliUserPayload(result.data)
    if (!parsed) {
      return {
        ok: false,
        error: {
          code: 'PARSE_ERROR',
          message: 'Malformed user payload from CLI',
        },
      }
    }

    return {
      ok: true,
      data: parsed,
    }
  }

  async listProjects(): Promise<CLIResult<VibecodeProject[]>> {
    const result = await this.runJSON<unknown>(['projects', 'list'])
    if (!result.ok) return result

    const projects = parseCliProjectsPayload(result.data)
    if (!projects) {
      return {
        ok: false,
        error: {
          code: 'PARSE_ERROR',
          message: 'Malformed project list payload from CLI',
        },
      }
    }

    return { ok: true, data: projects }
  }

  async createProject(
    name: string,
    opts?: { description?: string; template?: string },
  ): Promise<CLIResult<VibecodeProject>> {
    const platform = opts?.template || 'webapp'
    const description = opts?.description || name

    const result = await this.runJSON<any>(['projects', 'create', platform, description])
    if (!result.ok) return result

    const id = result.data?.projectId ?? result.data?.id
    if (!id) {
      return {
        ok: false,
        error: {
          code: 'PARSE_ERROR',
          message: 'Project create response did not include an id',
        },
      }
    }

    return {
      ok: true,
      data: {
        id: String(id),
        name,
        description,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        sandbox: { status: 'stopped' },
      },
    }
  }

  async deleteProject(projectId: string): Promise<CLIResult<{ ok: boolean }>> {
    return this.runJSON(['projects', 'delete', projectId])
  }

  async acquireSandbox(projectId: string): Promise<CLIResult<{ sandbox: any; links?: Record<string, unknown> }>> {
    const result = await this.runJSON<unknown>(['sandboxes', 'acquire', projectId])
    if (!result.ok) return result

    const parsed = parseAcquireSandboxPayload(result.data)
    if (!parsed) {
      return {
        ok: false,
        error: {
          code: 'PARSE_ERROR',
          message: 'Malformed sandbox acquisition payload from CLI',
        },
      }
    }

    return {
      ok: true,
      data: parsed,
    }
  }

  async exportSandbox(projectId: string, outputPath: string): Promise<CLIResult<{ path: string }>> {
    if (!this.binaryPath) {
      return { ok: false, error: { code: 'NOT_FOUND', message: 'vibecode-cli not found' } }
    }

    return await new Promise((resolve) => {
      const proc = spawn(this.binaryPath!, ['sandboxes', 'export', projectId, '--output', outputPath], {
        env: this.getEnv(),
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      let stderr = ''
      proc.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString()
      })

      proc.on('close', (code) => {
        if (code !== 0) {
          resolve({
            ok: false,
            error: {
              code: 'PROCESS_ERROR',
              message: stderr || `Failed to export sandbox (${code})`,
              exitCode: code ?? 1,
            },
          })
          return
        }

        resolve({ ok: true, data: { path: outputPath } })
      })
    })
  }

  agentSend(agentUrl: string, model: string, prompt: string, opts?: { signal?: AbortSignal }) {
    return this.runStream(['agent', 'send', '--model', model, '--output', 'json', agentUrl, prompt], {
      signal: opts?.signal,
    })
  }

  async agentStop(agentUrl: string): Promise<CLIResult<{ stopped: boolean }>> {
    const result = await this.runJSON<unknown>(['agent', 'stop', agentUrl])
    if (!result.ok) return result

    const parsed = parseAgentStopPayload(result.data)
    if (!parsed) {
      return {
        ok: false,
        error: {
          code: 'PARSE_ERROR',
          message: 'Malformed agent stop payload from CLI',
        },
      }
    }

    return { ok: true, data: parsed }
  }

  private parseError(exitCode: number, stdout: string, stderr: string): CLIError {
    const combined = `${stdout}\n${stderr}`.toLowerCase()

    if (combined.includes('unauthorized') || combined.includes('invalid key') || combined.includes('authentication')) {
      return {
        code: 'AUTH_FAILED',
        message: 'API key is invalid or expired',
        stderr,
        exitCode,
      }
    }

    if (combined.includes('forbidden')) {
      return {
        code: 'AUTH_FAILED',
        message: 'API key is invalid or account is restricted',
        stderr,
        exitCode,
      }
    }

    if (combined.includes('credits') && combined.includes('exhaust')) {
      return {
        code: 'CREDITS_EXHAUSTED',
        message: 'No credits remaining',
        stderr,
        exitCode,
      }
    }

    if (combined.includes('network') || combined.includes('econnrefused') || combined.includes('timeout') || combined.includes('dns')) {
      return {
        code: 'NETWORK_ERROR',
        message: 'Cannot reach Vibecode servers',
        stderr,
        exitCode,
      }
    }

    return {
      code: 'PROCESS_ERROR',
      message: stderr || stdout || `Process exited with code ${exitCode}`,
      stderr,
      exitCode,
    }
  }
}

export const cli = new VibecodeCliWrapper()
