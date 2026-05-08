type FlagName = 'migration_v2' | 'watcher_fsm_v2' | 'stream_fsm_v2'

function readFlag(envName: string, defaultValue = true) {
  const raw = process.env[envName]
  if (raw === undefined) return defaultValue
  return !['0', 'false', 'off', 'no'].includes(raw.toLowerCase())
}

export const featureFlags: Record<FlagName, boolean> = {
  migration_v2: readFlag('VS_FEATURE_MIGRATION_V2', true),
  watcher_fsm_v2: readFlag('VS_FEATURE_WATCHER_FSM_V2', true),
  stream_fsm_v2: readFlag('VS_FEATURE_STREAM_FSM_V2', true),
}
