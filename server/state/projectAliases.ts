/**
 * Project Alias service (CP-12, CP-14).
 *
 * Provides a clean API surface for project alias resolution,
 * extracted from state/migrations.ts for testability and
 * separation of concerns.
 *
 * Re-exports the core alias functions from migrations.ts
 * and adds validation helpers.
 */

export {
  upsertProjectAlias,
  deleteProjectAlias,
  getProjectAlias,
  resolveCanonicalProjectId,
  listHiddenSourceProjectIds,
  type ProjectAliasRecord,
} from '../state/migrations.ts'

import { resolveCanonicalProjectId, getProjectAlias, type ProjectAliasRecord } from '../state/migrations.ts'
import type { Database } from 'bun:sqlite'

/**
 * Check if a project ID has an active alias.
 */
export function isAliasedProject(projectId: string, db?: Database): boolean {
  return getProjectAlias(projectId, db) !== null
}

/**
 * Get the canonical project ID for a given project ID.
 * If no alias exists, returns the original project ID.
 */
export function getCanonicalId(projectId: string, db?: Database): string {
  return resolveCanonicalProjectId(projectId, db).canonicalProjectId
}

/**
 * Get the full alias resolution result, including the chain.
 */
export function getAliasResolution(projectId: string, db?: Database) {
  return resolveCanonicalProjectId(projectId, db)
}
