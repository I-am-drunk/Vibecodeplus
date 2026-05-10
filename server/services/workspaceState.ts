/**
 * Workspace State Service (CP-29).
 *
 * Provides a unified view of workspace state by aggregating:
 *  - SSH connection status (from sshManager)
 *  - Active streams (from streamRegistry)
 *  - Watcher state (from fileWatcher)
 *
 * This eliminates the need for routes to query multiple state holders
 * independently, reducing the risk of inconsistent state reads.
 */

import { sshManager } from '../ssh/manager.ts'
import { streamRegistry } from '../state/streams.ts'
import { fileWatcher } from '../ssh/watcher.ts'
import { agentUrls } from '../state/agents.ts'

export interface WorkspaceState {
  projectId: string
  connected: boolean
  hasAgentUrl: boolean
  activeStreams: number
  watcherState: string
  watcherForbiddenFailures: number
}

/**
 * Get the unified workspace state for a project.
 * This is the single authoritative source for workspace status.
 */
export function getWorkspaceState(projectId: string): WorkspaceState {
  const connected = sshManager.isConnected(projectId)
  const hasAgentUrl = !!agentUrls.get(projectId)
  const activeStreams = streamRegistry.getActive().filter(
    (s) => s.projectId === projectId
  ).length
  const watcherInfo = fileWatcher.getState(projectId)

  return {
    projectId,
    connected,
    hasAgentUrl,
    activeStreams,
    watcherState: watcherInfo.state,
    watcherForbiddenFailures: watcherInfo.forbiddenFailures,
  }
}

/**
 * Check if a workspace is fully operational (connected + has agent URL).
 * Used by routes that need to verify workspace readiness before operations.
 */
export function isWorkspaceOperational(projectId: string): boolean {
  return sshManager.isConnected(projectId) && !!agentUrls.get(projectId)
}

/**
 * Get all active workspace project IDs.
 */
export function getActiveWorkspaceIds(): string[] {
  const activeStreams = streamRegistry.getActive()
  const projectIds = new Set<string>()

  // From active streams
  for (const stream of activeStreams) {
    projectIds.add(stream.projectId)
  }

  // Note: sshManager doesn't expose a list of connected project IDs,
  // so we rely on streams as the primary indicator of active workspaces.

  return [...projectIds]
}
