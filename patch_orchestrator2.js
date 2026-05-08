const fs = require('fs');
const content = fs.readFileSync('server/continuation/orchestrator.ts', 'utf8');

let newContent = content.replace(
  /    setMigrationStage\(migrationId, 'acquiring_target', 'Acquiring sandbox for destination project'\)\n\n    const sandboxResult = await this.deps.cli.acquireSandbox\(targetProjectId\)\n    if \(!sandboxResult\.ok\) \{\n      return markMigrationFailed\(migrationId, \{\n        errorCode: `ACQUIRE_TARGET_\$\{sandboxResult\.error\.code\}`,/,
  `    setMigrationStage(migrationId, 'acquiring_target', 'Acquiring sandbox for destination project')

    let sandboxResult;
    try {
      sandboxResult = await this.deps.cli.acquireSandbox(targetProjectId)
    } catch (err) {
      return markMigrationFailed(migrationId, {
        errorCode: 'ACQUIRE_TARGET_TIMEOUT',
        errorMessage: String(err),
        stage: 'acquiring_target',
        partial: true,
        sourcePreserved: true,
        targetProjectId,
      })
    }
    
    if (!sandboxResult.ok) {
      return markMigrationFailed(migrationId, {
        errorCode: \`ACQUIRE_TARGET_\${sandboxResult.error.code}\`,`
);

newContent = newContent.replace(
  /    setMigrationStage\(migrationId, 'verifying_target', 'Verifying destination project visibility'\)\n\n    const verify = await this\.deps\.cli\.listProjects\(\)\n    const exists = verifyProjectPresenceForContinuation\(verify as any, targetProjectId\)\n\n    if \(!exists\) \{/,
  `    setMigrationStage(migrationId, 'verifying_target', 'Verifying destination project visibility')

    let verify, exists;
    try {
      verify = await this.deps.cli.listProjects()
      exists = verifyProjectPresenceForContinuation(verify as any, targetProjectId)
    } catch (err) {
      return markMigrationFailed(migrationId, {
        errorCode: 'VERIFY_TARGET_FAILED',
        errorMessage: String(err),
        stage: 'verifying_target',
        partial: true,
        sourcePreserved: true,
        targetProjectId,
      })
    }

    if (!exists) {`
);

fs.writeFileSync('server/continuation/orchestrator.ts', newContent);
