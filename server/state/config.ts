import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { createLogger } from '../lib/logger.ts'

const log = createLogger('config')

export type AppConfig = {
  port: number
  autoOpen: boolean
  cliBinaryPath?: string
  backup: {
    enabled: boolean
    directory: string
    debounceSeconds: number
    maxPerProject: number
    onFileChange: boolean
    onAgentResponse: boolean
  }
  credits: {
    lowThreshold: number
    warnOnLow: boolean
    showInHeader: boolean
  }
  editor: {
    theme: 'dark' | 'light' | 'system'
    fontSize: number
    fontFamily: string
    wordWrap: boolean
    minimap: boolean
    tabSize: number
    lineNumbers: boolean
  }
  chat: {
    defaultModel: string
    showToolCalls: boolean
    showReasoning: boolean
    autoScroll: boolean
  }
  layout: {
    fileTreeWidth: number
    chatWidth: number
    previewHeight: number
    fileTreeCollapsed: boolean
    chatCollapsed: boolean
    previewCollapsed: boolean
    terminalHeight: number
    terminalCollapsed: boolean
  }
  debug: boolean
  enableTerminal: boolean
}

export const DEFAULTS: AppConfig = {
  port: 3847,
  autoOpen: true,
  backup: {
    enabled: true,
    directory: join(getDataDir(), 'backups'),
    debounceSeconds: 60,
    maxPerProject: 10,
    onFileChange: true,
    onAgentResponse: true,
  },
  credits: { lowThreshold: 5.0, warnOnLow: true, showInHeader: true },
  editor: {
    theme: 'dark',
    fontSize: 14,
    fontFamily: 'JetBrains Mono',
    wordWrap: true,
    minimap: false,
    tabSize: 2,
    lineNumbers: true,
  },
  chat: {
    defaultModel: 'claude-sonnet-4-6',
    showToolCalls: true,
    showReasoning: false,
    autoScroll: true,
  },
  layout: {
    fileTreeWidth: 250,
    chatWidth: 400,
    previewHeight: 300,
    fileTreeCollapsed: false,
    chatCollapsed: false,
    previewCollapsed: true,
    terminalHeight: 200,
    terminalCollapsed: true,
  },
  debug: false,
  enableTerminal: true,
}

let config: AppConfig = { ...DEFAULTS }

export function getDataDir(): string {
  return join(process.env.HOME ?? '/tmp', '.local', 'share', 'vibecode-studio')
}

function getConfigDir(): string {
  return process.env.VS_CONFIG_PATH
    ? join(process.env.VS_CONFIG_PATH, '..')
    : join(process.env.HOME ?? '/tmp', '.config', 'vibecode-studio')
}

function getConfigPath(): string {
  return process.env.VS_CONFIG_PATH ?? join(getConfigDir(), 'config.json')
}

export function loadConfig(): AppConfig {
  const configPath = getConfigPath()
  try {
    if (existsSync(configPath)) {
      const raw = JSON.parse(readFileSync(configPath, 'utf-8'))
      config = validateConfigSchema(raw, DEFAULTS)
    } else {
      mkdirSync(getConfigDir(), { recursive: true })
      writeFileSync(configPath, JSON.stringify(DEFAULTS, null, 2))
      config = { ...DEFAULTS }
    }
  } catch (error) {
    log.warn({ error: String(error) }, 'config load failed, using defaults')
    config = { ...DEFAULTS }
  }

  if (process.env.VS_PORT) config.port = parseInt(process.env.VS_PORT)
  if (process.env.VS_DEBUG) config.debug = true
  if (process.env.VS_NO_OPEN) config.autoOpen = false

  return config
}

export function getConfig(): AppConfig { return config }

const ALLOWED_CONFIG_KEYS = new Set([
  'autoOpen', 'debug', 'enableTerminal',
  'backup', 'credits', 'editor', 'chat', 'layout',
])

function validateConfigUpdate(partial: Record<string, unknown>): Record<string, unknown> {
  const filtered: Record<string, unknown> = {}
  for (const key of Object.keys(partial)) {
    if (!ALLOWED_CONFIG_KEYS.has(key)) continue
    filtered[key] = partial[key]
  }
  return filtered
}

export function updateConfig(partial: Record<string, unknown>): { restartRequired: boolean } {
  const oldPort = config.port
  const validated = validateConfigUpdate(partial)
  const merged = deepMerge(config, validated)
  config = validateConfigSchema(merged, DEFAULTS)
  const configPath = getConfigPath()
  mkdirSync(getConfigDir(), { recursive: true })
  writeFileSync(configPath, JSON.stringify(config, null, 2))
  return { restartRequired: config.port !== oldPort }
}

function deepMerge(target: Record<string, any>, source: Record<string, any>): Record<string, any> {
  const result = { ...target }
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key]) && target[key]) {
      result[key] = deepMerge(target[key], source[key])
    } else {
      result[key] = source[key]
    }
  }
  return result
}

/**
 * Validate a loaded config against the expected schema.
 * Invalid fields are replaced with defaults and a warning is logged.
 * This prevents malformed config files from crashing the server.
 */
export function validateConfigSchema(loaded: Record<string, any>, defaults: Record<string, any>): AppConfig {
  if (!loaded || typeof loaded !== 'object' || Array.isArray(loaded)) {
    return { ...defaults } as AppConfig
  }

  const result = deepMerge(defaults, loaded)

  // Top-level type checks
  const topChecks: Array<[string, 'number' | 'boolean' | 'string']> = [
    ['port', 'number'],
    ['autoOpen', 'boolean'],
    ['debug', 'boolean'],
    ['enableTerminal', 'boolean'],
  ]

  for (const [key, expectedType] of topChecks) {
    if (typeof result[key] !== expectedType) {
      log.warn({ key, expectedType, actual: typeof result[key] }, 'config field has wrong type, using default')
      result[key] = defaults[key]
    }
  }

  // Optional string field
  if (result.cliBinaryPath !== undefined && typeof result.cliBinaryPath !== 'string') {
    log.warn({ key: 'cliBinaryPath' }, 'config field has wrong type, removing')
    delete result.cliBinaryPath
  }

  // Nested object type checks
  const nestedChecks: Array<[string, Array<[string, 'number' | 'boolean' | 'string']>]> = [
    ['backup', [
      ['enabled', 'boolean'],
      ['directory', 'string'],
      ['debounceSeconds', 'number'],
      ['maxPerProject', 'number'],
      ['onFileChange', 'boolean'],
      ['onAgentResponse', 'boolean'],
    ]],
    ['credits', [
      ['lowThreshold', 'number'],
      ['warnOnLow', 'boolean'],
      ['showInHeader', 'boolean'],
    ]],
    ['editor', [
      ['fontSize', 'number'],
      ['fontFamily', 'string'],
      ['wordWrap', 'boolean'],
      ['minimap', 'boolean'],
      ['tabSize', 'number'],
      ['lineNumbers', 'boolean'],
    ]],
    ['chat', [
      ['defaultModel', 'string'],
      ['showToolCalls', 'boolean'],
      ['showReasoning', 'boolean'],
      ['autoScroll', 'boolean'],
    ]],
    ['layout', [
      ['fileTreeWidth', 'number'],
      ['chatWidth', 'number'],
      ['previewHeight', 'number'],
      ['fileTreeCollapsed', 'boolean'],
      ['chatCollapsed', 'boolean'],
      ['previewCollapsed', 'boolean'],
      ['terminalHeight', 'number'],
      ['terminalCollapsed', 'boolean'],
    ]],
  ]

  for (const [section, fields] of nestedChecks) {
    if (!isRecord(result[section])) {
      log.warn({ section }, 'config section missing or not an object, using defaults')
      result[section] = defaults[section]
      continue
    }

    for (const [field, expectedType] of fields) {
      if (typeof result[section][field] !== expectedType) {
        log.warn({ section, field, expectedType, actual: typeof result[section][field] }, 'config field has wrong type, using default')
        result[section][field] = defaults[section][field]
      }
    }
  }

  // Validate editor.theme enum
  const validThemes = new Set(['dark', 'light', 'system'])
  if (!validThemes.has(result.editor?.theme)) {
    log.warn({ theme: result.editor?.theme }, 'config editor.theme invalid, using default')
    result.editor.theme = defaults.editor.theme
  }

  // Validate port range
  if (typeof result.port === 'number' && (result.port < 1 || result.port > 65535 || !Number.isInteger(result.port))) {
    log.warn({ port: result.port }, 'config port out of range, using default')
    result.port = defaults.port
  }

  return result as AppConfig
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
