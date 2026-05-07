import { mkdirSync, unlinkSync, statSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { cli } from '../cli/wrapper.ts'
import { getDB } from '../state/db.ts'
import { getConfig } from '../state/config.ts'
import { wsHub } from '../ws/hub.ts'
import type { BackupTrigger } from '../cli/types.ts'

class BackupCoordinator {
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private activeBackups = new Map<string, Promise<void>>()

  requestBackup(projectId: string, trigger: BackupTrigger, opts?: { immediate?: boolean; sessionId?: string }) {
    const config = getConfig().backup
    if (!config.enabled && trigger !== 'credits_exhausted') return

    if (opts?.immediate || trigger === 'credits_exhausted' || trigger === 'manual') {
      this.executeBackup(projectId, trigger, opts?.sessionId)
      return
    }

    const existing = this.debounceTimers.get(projectId)
    if (existing) clearTimeout(existing)

    this.debounceTimers.set(projectId, setTimeout(() => {
      this.debounceTimers.delete(projectId)
      this.executeBackup(projectId, trigger, opts?.sessionId)
    }, config.debounceSeconds * 1000))
  }

  private async executeBackup(projectId: string, trigger: BackupTrigger, sessionId?: string) {
    if (this.activeBackups.has(projectId)) {
      await this.activeBackups.get(projectId)
    }

    const backupId = randomUUID()
    const config = getConfig().backup
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const dir = join(config.directory, projectId)
    const filePath = join(dir, `${timestamp}.tar.gz`)

    const promise = (async () => {
      try {
        mkdirSync(dir, { recursive: true })
        wsHub.broadcast(`backups:${projectId}`, { type: 'backup:started', projectId, backupId })

        const result = await cli.exportSandbox(projectId, filePath)
        if (!result.ok) throw new Error(result.error.message)

        const stat = statSync(filePath)
        const db = getDB()

        db.prepare(`
          INSERT INTO backups (id, project_id, session_id, file_path, file_size, file_count, trigger_type)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(backupId, projectId, sessionId ?? null, filePath, stat.size, 0, trigger)

        wsHub.broadcast(`backups:${projectId}`, {
          type: 'backup:completed', projectId, backupId, fileSize: stat.size,
        })

        this.rotateBackups(projectId)
      } catch (err) {
        wsHub.broadcast(`backups:${projectId}`, {
          type: 'backup:error', projectId, error: String(err),
        })
      } finally {
        this.activeBackups.delete(projectId)
      }
    })()

    this.activeBackups.set(projectId, promise)
    return { backupId, promise }
  }

  private rotateBackups(projectId: string) {
    const config = getConfig().backup
    const db = getDB()
    const rows = db.prepare(
      'SELECT id, file_path FROM backups WHERE project_id = ? ORDER BY created_at DESC'
    ).all(projectId) as { id: string; file_path: string }[]

    const toDelete = rows.slice(config.maxPerProject)
    for (const row of toDelete) {
      try { unlinkSync(row.file_path) } catch { /* file may be gone */ }
      db.prepare('DELETE FROM backups WHERE id = ?').run(row.id)
    }
  }

  getLatestBackup(projectId: string): { id: string; file_path: string; file_size: number; created_at: string } | null {
    const db = getDB()
    const row = db.prepare(
      'SELECT id, file_path, file_size, created_at FROM backups WHERE project_id = ? ORDER BY created_at DESC LIMIT 1'
    ).get(projectId) as { id: string; file_path: string; file_size: number; created_at: string } | undefined
    return row ?? null
  }

  listBackups(projectId: string): { id: string; file_path: string; file_size: number; created_at: string; trigger_type: string }[] {
    const db = getDB()
    return db.prepare(
      'SELECT id, file_path, file_size, created_at, trigger_type FROM backups WHERE project_id = ? ORDER BY created_at DESC'
    ).all(projectId) as any[]
  }
}

export const backupCoordinator = new BackupCoordinator()
