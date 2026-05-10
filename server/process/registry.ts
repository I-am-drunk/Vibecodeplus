import { execSync } from 'child_process'
import type { ChildProcess } from 'child_process'

export function which(cmd: string): string | null {
  if (!/^[a-zA-Z0-9_.+-]+$/.test(cmd)) return null
  try {
    return execSync(`which ${cmd}`, { encoding: 'utf-8' }).trim() || null
  } catch {
    return null
  }
}

class ProcessRegistry {
  private processes = new Map<string, ChildProcess>()

  register(id: string, proc: ChildProcess) {
    this.processes.set(id, proc)
    proc.on('exit', () => this.processes.delete(id))
  }

  kill(id: string) {
    const proc = this.processes.get(id)
    if (proc && !proc.killed) {
      proc.kill('SIGTERM')
    }
  }

  killAll() {
    for (const [id, proc] of this.processes) {
      if (!proc.killed) proc.kill('SIGTERM')
    }
    this.processes.clear()
  }

  has(id: string) { return this.processes.has(id) }
  get(id: string) { return this.processes.get(id) }
}

export const processRegistry = new ProcessRegistry()
