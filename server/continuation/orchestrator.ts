import { createHash } from 'crypto'
import { cli as defaultCli } from '../cli/wrapper.ts'
import { getDB } from '../state/db.ts'
import { loadStoredAuth as defaultLoadStoredAuth } from '../state/auth.ts'
import { sshManager as defaultSshManager } from '../ssh/manager.ts'
import { fileWatcher as defaultFileWatcher } from '../ssh/watcher.ts'
import { pushToProject as defaultPushToProject } from './capture.ts'
import { agentUrls } from '../state/agents.ts'
import { createLogger } from '../lib/logger.ts'
import {
  createProjectMigration,
  getLatestMigrationForSource,
  getProjectMigration,
  markMigrationCompleted,
  markMigrationFailed,
  resolveCanonicalProjectId,
  setMigrationStage,
  setMigrationTarget,
  upsertProjectAlias,
  type MigrationStatus,
  type ProjectMigrationRecord,
} from '../state/migrations.ts'

const log = createLogger('continuation-orchestrator')

type CliLike = {
  createProject: typeof defaultCli.createProject
  listProjects: typeof defaultCli.listProjects
  acquireSandbox: typeof defaultCli.acquireSandbox
}

type SshLike = {
  primeCredentials: typeof defaultSshManager.primeCredentials
  getConnection: typeof defaultSshManager.getConnection
  closeConnection: typeof defaultSshManager.closeConnection
}

type WatcherLike = {
  remapProject: typeof defaultFileWatcher.remapProject
}

type Dependencies = {
  cli: CliLike
  sshManager: SshLike
  fileWatcher: WatcherLike
  pushToProject: (sourceProjectId: string, targetProjectId: string) => Promise<void>
  loadStoredAuth: typeof defaultLoadStoredAuth
}

const defaultDependencies: Dependencies = {
  cli: defaultCli,
  sshManager: defaultSshManager,
  fileWatcher: defaultFileWatcher,
  pushToProject: defaultPushToProject,
  loadStoredAuth: defaultLoadStoredAuth,
}

type SourceProjectRow = {
  id: string
  name: string
  description: string | null
  default_model: string | null
  snapshot_dir: string | null
  api_key_hash: string | null
}

function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex').slice(0, 16)
}

function isRunningStatus(status: MigrationStatus) {
  return status === 'pending' || status === 'running'
}

export function verifyProjectPresenceForContinuation(
  listProjectsResult: { ok: boolean; data?: unknown },
  targetProjectId: string,
): boolean {
  if (!listProjectsResult.ok) return false
  if (!Array.isArray(listProjectsResult.data)) return false

  return listProjectsResult.data.some((project) => {
    return typeof project === 'object' && project !== null && (project as any).id === targetProjectId
  })
}

export class ContinuationOrchestrator {
  private inFlightBySource = new Map<string, Promise<ProjectMigrationRecord>>()
  private deps: Dependencies

  constructor(deps: Partial<Dependencies> = {}) {
    this.deps = {
      ...defaultDependencies,
      ...deps,
    }
  }

  start(sourceProjectId: string): ProjectMigrationRecord {
    const latest = getLatestMigrationForSource(sourceProjectId)

    if (latest && (isRunningStatus(latest.status) || latest.status === 'completed')) {
      if (isRunningStatus(latest.status)) {
        this.ensureExecution(sourceProjectId, latest.id)
      }
      return latest
    }

    const resolved = resolveCanonicalProjectId(sourceProjectId)
    if (resolved.mappedFromProjectId && resolved.canonicalProjectId !== sourceProjectId) {
      const canonicalLatest = getLatestMigrationForSource(sourceProjectId)
      if (canonicalLatest) return canonicalLatest
    }

    const migration = createProjectMigration(sourceProjectId)
    this.ensureExecution(sourceProjectId, migration.id)
    return migration
  }

  get(migrationId: string): ProjectMigrationRecord | null {
    return getProjectMigration(migrationId)
  }

  private ensureExecution(sourceProjectId: string, migrationId: string) {
    if (this.inFlightBySource.has(sourceProjectId)) return

    const promise = this.execute(sourceProjectId, migrationId)
      .catch((error) => {
        log.error({ sourceProjectId, migrationId, error: String(error) }, 'migration execution failed unexpectedly')
        const current = getProjectMigration(migrationId)
        if (current && current.status !== 'completed' && current.status !== 'partial_failed' && current.status !== 'failed') {
          markMigrationFailed(migrationId, {
            errorCode: 'MIGRATION_EXECUTION_ERROR',
            errorMessage: error instanceof Error ? error.message : String(error),
            stage: 'failed',
            partial: false,
            sourcePreserved: true,
          })
        }
        const fallback = getProjectMigration(migrationId)
        if (!fallback) {
          throw error
        }
        return fallback
      })
      .finally(() => {
        this.inFlightBySource.delete(sourceProjectId)
      })

    this.inFlightBySource.set(sourceProjectId, promise)
  }

  private async execute(sourceProjectId: string, migrationId: string): Promise<ProjectMigrationRecord> {
    const db = getDB()
    const source = db.prepare('SELECT * FROM projects WHERE id = ?').get(sourceProjectId) as SourceProjectRow | undefined

    if (!source) {
      return markMigrationFailed(migrationId, {
        errorCode: 'SOURCE_NOT_FOUND',
        errorMessage: 'Source project not found',
        stage: 'failed',
        partial: false,
        sourcePreserved: true,
      })
    }

    const auth = this.deps.loadStoredAuth()
    if (!auth?.key) {
      return markMigrationFailed(migrationId, {
        errorCode: 'AUTH_REQUIRED',
        errorMessage: 'No API key configured',
        stage: 'failed',
        partial: false,
        sourcePreserved: true,
      })
    }

    const continuationName = source.name || 'Continued Project'
    const continuationDescription = source.description || continuationName

    setMigrationStage(migrationId, 'creating_target', 'Creating destination project')
    const createResult = await this.deps.cli.createProject(continuationName, {
      description: continuationDescription,
    })

    if (!createResult.ok) {
      return markMigrationFailed(migrationId, {
        errorCode: `CREATE_TARGET_${createResult.error.code}`,
        errorMessage: createResult.error.message || 'Failed to create continuation project',
        stage: 'failed',
        partial: false,
        sourcePreserved: true,
      })
    }

    const targetProjectId = createResult.data.id
    setMigrationTarget(migrationId, targetProjectId)

    db.prepare(`
      INSERT INTO projects (id, name, description, default_model, api_key_hash, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        description = excluded.description,
        default_model = excluded.default_model,
        api_key_hash = excluded.api_key_hash,
        updated_at = datetime('now')
    `).run(
      targetProjectId,
      continuationName,
      continuationDescription,
      source.default_model || 'claude-sonnet-4-6',
      hashKey(auth.key),
    )

    setMigrationStage(migrationId, 'acquiring_target', 'Acquiring sandbox for destination project')

    const sandboxResult = await this.deps.cli.acquireSandbox(targetProjectId)
    if (!sandboxResult.ok) {
      return markMigrationFailed(migrationId, {
        errorCode: `ACQUIRE_TARGET_${sandboxResult.error.code}`,
        errorMessage: sandboxResult.error.message || 'Could not acquire sandbox for destination project',
        stage: 'acquiring_target',
        partial: true,
        sourcePreserved: true,
        targetProjectId,
      })
    }

    const sandbox = sandboxResult.data.sandbox
    const links = sandboxResult.data.links

    try {
      this.deps.sshManager.primeCredentials(targetProjectId, sandbox)
      await this.deps.sshManager.getConnection(targetProjectId)
    } catch (error) {
      return markMigrationFailed(migrationId, {
        errorCode: 'TARGET_SSH_CONNECT_FAILED',
        errorMessage: error instanceof Error ? error.message : String(error),
        stage: 'acquiring_target',
        partial: true,
        sourcePreserved: true,
        targetProjectId,
      })
    }

    if ((links as any)?.agentUrl?.url) {
      agentUrls.set(targetProjectId, String((links as any).agentUrl.url))
    }

    let warning: string | null = null

    if (source.snapshot_dir) {
      setMigrationStage(migrationId, 'transferring_snapshot', 'Transferring source snapshot to destination')
      try {
        await this.deps.pushToProject(sourceProjectId, targetProjectId)
      } catch (error) {
        return markMigrationFailed(migrationId, {
          errorCode: 'SNAPSHOT_TRANSFER_FAILED',
          errorMessage: error instanceof Error ? error.message : String(error),
          stage: 'transferring_snapshot',
          partial: true,
          sourcePreserved: true,
          targetProjectId,
        })
      }
    } else {
      warning = 'No local snapshot was available to transfer'
    }

    setMigrationStage(migrationId, 'verifying_target', 'Verifying destination project visibility')

    const verify = await this.deps.cli.listProjects()
    const exists = verifyProjectPresenceForContinuation(verify as any, targetProjectId)

    if (!exists) {
      const message = verify.ok
        ? 'Destination project could not be verified after creation'
        : verify.error.message || 'Could not verify destination project'

      return markMigrationFailed(migrationId, {
        errorCode: verify.ok ? 'TARGET_VERIFY_MISSING' : `TARGET_VERIFY_${verify.error.code}`,
        errorMessage: message,
        stage: 'verifying_target',
        partial: true,
        sourcePreserved: true,
        targetProjectId,
      })
    }

    upsertProjectAlias(sourceProjectId, targetProjectId, migrationId)

    this.deps.fileWatcher.remapProject(sourceProjectId, targetProjectId)
    await this.deps.sshManager.closeConnection(sourceProjectId).catch(() => {})
    agentUrls.delete(sourceProjectId)

    setMigrationStage(migrationId, 'completed', 'Migration complete')
    return markMigrationCompleted(
      migrationId,
      targetProjectId,
      {
        warning,
        sourcePreserved: true,
      },
    )
  }
}

export const continuationOrchestrator = new ContinuationOrchestrator()
