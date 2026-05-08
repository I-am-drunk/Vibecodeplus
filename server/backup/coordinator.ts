import { existsSync, mkdirSync, statSync, unlinkSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { cli } from '../cli/wrapper.ts'
import { getDB } from '../state/db.ts'
import { getConfig } from '../state/config.ts'
import { wsHub } from '../ws/hub.ts'
import { sshManager } from '../ssh/manager.ts'
import type { BackupTrigger } from '../cli/types.ts'
import { createLogger } from '../lib/logger.ts'

const log = createLogger('backup')

type BackupRecord = {
  id: string
  project_id: string
  session_id: string | null
  file_path: string
  file_size: number
  file_count: number
  trigger_type: string
  created_at: string
}

class BackupCoordinator {
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private activeBackups = new Map<string, Promise<BackupRecord>>()

  requestBackup(projectId: string, trigger: BackupTrigger, opts?: { immediate?: boolean; sessionId?: string }) {
    const config = getConfig().backup
    if (!config.enabled && trigger !== 'credits_exhausted') return

    if (opts?.immediate || trigger === 'credits_exhausted' || trigger === 'manual') {
      void this.backupNow(projectId, { trigger, sessionId: opts?.sessionId }).catch(() => {})
      return
    }

    const existing = this.debounceTimers.get(projectId)
    if (existing) clearTimeout(existing)

    const timer = setTimeout(() => {
      this.debounceTimers.delete(projectId)
      void this.backupNow(projectId, { trigger, sessionId: opts?.sessionId }).catch(() => {})
    }, config.debounceSeconds * 1000)

    this.debounceTimers.set(projectId, timer)
  }

  async backupNow(projectId: string, opts?: { trigger?: BackupTrigger; sessionId?: string }) {
    const trigger = opts?.trigger ?? 'manual'

    if (this.activeBackups.has(projectId)) {
      return this.activeBackups.get(projectId)!
    }

    const promise = this.executeBackup(projectId, trigger, opts?.sessionId)
    this.activeBackups.set(projectId, promise)

    try {
      return await promise
    } finally {
      this.activeBackups.delete(projectId)
    }
  }

  async restore(projectId: string, backupId: string) {
    const db = getDB()
    const row = db.prepare(
      'SELECT * FROM backups WHERE id = ? AND project_id = ? LIMIT 1',
    ).get(backupId, projectId) as BackupRecord | undefined

    if (!row) throw new Error('Backup not found')
    if (!existsSync(row.file_path)) throw new Error('Backup file is missing from disk')

    const remotePath = `/tmp/vs-restore-${backupId}.tar.gz`
    const sftp = await sshManager.getSFTP(projectId)

    await new Promise<void>((resolve, reject) => {
      sftp.fastPut(row.file_path, remotePath, {}, (err: unknown) => {
        if (err) reject(err)
        else resolve()
      })
    })

    await sshManager.exec(projectId, `mkdir -p /home/user/workspace`)
    await sshManager.exec(
      projectId,
      `cd /home/user/workspace && tar xzf '${remotePath}' --strip-components=1 2>/dev/null || tar xzf '${remotePath}' 2>/dev/null`,
    )
    await sshManager.exec(projectId, `rm -f '${remotePath}'`)

    wsHub.broadcast(`backups:${projectId}`, { type: 'backup:restored', projectId, backupId })
    log.info({ projectId, backupId }, 'backup restored')
  }

  async restoreLatest(projectId: string) {
    const latest = this.getLatestBackup(projectId)
    if (!latest) return false
    await this.restore(projectId, latest.id)
    return true
  }

  getLatestBackup(projectId: string): { id: string; file_path: string; file_size: number; created_at: string } | null {
    const db = getDB()
    const row = db.prepare(
      'SELECT id, file_path, file_size, created_at FROM backups WHERE project_id = ? ORDER BY created_at DESC LIMIT 1',
    ).get(projectId) as { id: string; file_path: string; file_size: number; created_at: string } | undefined

    return row ?? null
  }

  listBackups(projectId: string) {
    const db = getDB()
    return db.prepare(
      'SELECT id, file_path, file_size, created_at, trigger_type FROM backups WHERE project_id = ? ORDER BY created_at DESC',
    ).all(projectId) as Array<{ id: string; file_path: string; file_size: number; created_at: string; trigger_type: string }>
  }

  private async executeBackup(projectId: string, trigger: BackupTrigger, sessionId?: string): Promise<BackupRecord> {
    const backupId = randomUUID()
    const config = getConfig().backup

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const projectDir = join(config.directory, projectId)
    const filePath = join(projectDir, `${timestamp}.tar.gz`)

    mkdirSync(projectDir, { recursive: true })
    wsHub.broadcast(`backups:${projectId}`, { type: 'backup:started', projectId, backupId, trigger })

    const result = await cli.exportSandbox(projectId, filePath)
    if (!result.ok) {
      wsHub.broadcast(`backups:${projectId}`, {
        type: 'backup:error',
        projectId,
        backupId,
        message: result.error.message,
      })
      throw new Error(result.error.message)
    }

    const stats = statSync(filePath)
    const db = getDB()

    db.prepare(`
      INSERT INTO backups (id, project_id, session_id, file_path, file_size, file_count, trigger_type)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(backupId, projectId, sessionId ?? null, filePath, stats.size, 0, trigger)

    const row = db.prepare('SELECT * FROM backups WHERE id = ?').get(backupId) as BackupRecord

    wsHub.broadcast(`backups:${projectId}`, {
      type: 'backup:completed',
      projectId,
      backupId,
      trigger,
      fileSize: stats.size,
    })

    this.rotateBackups(projectId)
    log.info({ projectId, backupId, trigger, size: stats.size }, 'backup completed')

    return row
  }

  private rotateBackups(projectId: string) {
    const config = getConfig().backup
    const db = getDB()

    const rows = db.prepare(
      'SELECT id, file_path FROM backups WHERE project_id = ? ORDER BY created_at DESC',
    ).all(projectId) as Array<{ id: string; file_path: string }>

    const toDelete = rows.slice(config.maxPerProject)
    for (const row of toDelete) {
      try {
        unlinkSync(row.file_path)
      } catch {
        // best effort
      }
      db.prepare('DELETE FROM backups WHERE id = ?').run(row.id)
    }
  }
}

export const backupCoordinator = new BackupCoordinator()
