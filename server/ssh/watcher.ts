import { sshManager } from './manager.ts'
import { scheduleCapture } from '../continuation/capture.ts'

type FileChange = { path: string; action: 'created' | 'modified' | 'deleted' }
type ChangeHandler = (projectId: string, changes: FileChange[]) => void

class FileChangeWatcher {
  private intervals = new Map<string, ReturnType<typeof setInterval>>()
  private handlers = new Set<ChangeHandler>()

  start(projectId: string, pollMs = 15000) {
    if (this.intervals.has(projectId)) return

    sshManager.exec(projectId, 'touch /tmp/.vibecode-check').catch(() => {})

    const interval = setInterval(async () => {
      try {
        const output = await sshManager.exec(projectId, `
          find /home/user/workspace -maxdepth 10 -newer /tmp/.vibecode-check -type f \
            \\( -name node_modules -o -name .git \\) -prune -o -print 2>/dev/null;
          touch /tmp/.vibecode-check
        `)
        const files = output.split('\n').filter(Boolean)
        if (files.length > 0) {
          const changes: FileChange[] = files.map(f => ({
            path: f.replace('/home/user/workspace', ''),
            action: 'modified' as const,
          }))
          for (const h of this.handlers) h(projectId, changes)
          // Debounced snapshot for continuation system
          scheduleCapture(projectId)
        }
      } catch { /* SSH might be disconnected, ignore */ }
    }, pollMs)

    this.intervals.set(projectId, interval)
  }

  stop(projectId?: string) {
    if (projectId) {
      const interval = this.intervals.get(projectId)
      if (interval) { clearInterval(interval); this.intervals.delete(projectId) }
    } else {
      for (const [, interval] of this.intervals) clearInterval(interval)
      this.intervals.clear()
    }
  }

  onChange(handler: ChangeHandler) {
    this.handlers.add(handler)
    return () => { this.handlers.delete(handler) }
  }
}

export const fileWatcher = new FileChangeWatcher()
