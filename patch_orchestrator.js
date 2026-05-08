const fs = require('fs');
const path = require('path');
const content = fs.readFileSync('server/continuation/orchestrator.ts', 'utf8');

let newContent = content.replace(
  /type CliLike = \{/,
  "type CliLike = {\n  deleteProject: typeof defaultCli.deleteProject"
);

newContent = newContent.replace(
  /  start\(sourceProjectId: string\): ProjectMigrationRecord \{/,
  "  private async cleanupOrphanedMigrations(sourceProjectId: string, excludeMigrationId: string) {\n    const { getDB } = require('../state/db.ts');\n    const db = getDB();\n    const rows = db.prepare(`SELECT id, target_project_id FROM project_migrations WHERE source_project_id = ? AND id != ? AND target_project_id IS NOT NULL AND status IN ('failed', 'partial_failed')`).all(sourceProjectId, excludeMigrationId) as Array<{ id: string, target_project_id: string }>;\n    for (const row of rows) {\n      try {\n        await this.deps.cli.deleteProject(row.target_project_id);\n        log.info({ sourceProjectId, targetProjectId: row.target_project_id }, 'cleaned up orphaned target project');\n      } catch (error) {\n        log.error({ targetProjectId: row.target_project_id, error: String(error) }, 'failed to clean up orphaned target project');\n      }\n    }\n  }\n\n  start(sourceProjectId: string): ProjectMigrationRecord {"
);

newContent = newContent.replace(
  /    const migration = createProjectMigration\(sourceProjectId\)\s*\/\/ REUSE TARGET: If previous failed but had a target, reuse it to prevent orphan clones\s*if \(latest && \(latest\.status === 'failed' \|\| latest\.status === 'partial_failed'\) && latest\.targetProjectId\) \{\s*setMigrationTarget\(migration\.id, latest\.targetProjectId\)\s*\}/,
  `    let reusableTargetId: string | null = null;
    if (latest && (latest.status === 'failed' || latest.status === 'partial_failed') && latest.targetProjectId) {
      reusableTargetId = latest.targetProjectId;
      log.info({ sourceProjectId, targetProjectId: reusableTargetId }, 'reusing existing target project from previous attempt');
    }

    const migration = createProjectMigration(sourceProjectId, reusableTargetId);
    
    if (!reusableTargetId) {
      this.cleanupOrphanedMigrations(sourceProjectId, migration.id).catch(err => {
        log.error({ sourceProjectId, error: String(err) }, 'Failed to run cleanupOrphanedMigrations');
      });
    } else {
      setMigrationTarget(migration.id, reusableTargetId);
    }`
);

fs.writeFileSync('server/continuation/orchestrator.ts', newContent);
