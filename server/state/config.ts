import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

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

const DEFAULTS: AppConfig = {
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
      config = deepMerge(DEFAULTS, raw) as AppConfig
    } else {
      mkdirSync(getConfigDir(), { recursive: true })
      writeFileSync(configPath, JSON.stringify(DEFAULTS, null, 2))
      config = { ...DEFAULTS }
    }
  } catch {
    config = { ...DEFAULTS }
  }

  if (process.env.VS_PORT) config.port = parseInt(process.env.VS_PORT)
  if (process.env.VS_DEBUG) config.debug = true
  if (process.env.VS_NO_OPEN) config.autoOpen = false

  return config
}

export function getConfig(): AppConfig { return config }

export function updateConfig(partial: Record<string, unknown>): { restartRequired: boolean } {
  const oldPort = config.port
  config = deepMerge(config, partial) as AppConfig
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
