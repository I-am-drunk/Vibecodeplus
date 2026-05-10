export type CLIResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: CLIError }

export type CLIError = {
  code:
    | 'NOT_FOUND'
    | 'AUTH_FAILED'
    | 'CREDITS_EXHAUSTED'
    | 'NETWORK_ERROR'
    | 'TIMEOUT'
    | 'PROCESS_ERROR'
    | 'PARSE_ERROR'
    | 'UNKNOWN'
  message: string
  stderr?: string
  exitCode?: number
}

export type VibecodeUser = {
  id: string
  email: string
  name: string
  plan: 'free' | 'pro' | 'team' | 'enterprise'
  credits: {
    balance: number
    used: number
    limit: number | null
  }
}

export type VibecodeProject = {
  id: string
  name: string
  description?: string
  created_at: string
  updated_at: string
  sandbox: {
    status: 'running' | 'stopped' | 'provisioning' | 'error'
    region?: string
  }
}

export type SandboxCredentials = {
  host: string
  port: number
  user: string
  key_path: string
  password?: string
  privateKey?: string
  sshPassword?: string
}

export type AgentStreamEvent =
  | { type: 'init'; init: { session_id: string; model: string; tools: string[]; working_dir: string } }
  | { type: 'text'; subtype: 'start' | 'delta' | 'full' | 'stop'; text?: string }
  | { type: 'thinking'; thinking?: { summary?: string } }
  | { type: 'tool_use'; tool_use: { id: string; name: string; input: any } }
  | { type: 'tool_result'; tool_result: { tool_use_id: string; content: string } }
  | { type: 'commit'; commit: { checksum: string; summary: string } }
  | { type: 'done'; input_tokens: number; output_tokens: number; duration_millis: number }
  | { type: 'error'; error: string; code?: string }
  | { type: 'credits_exhausted' }
  | { type: 'credits_low'; balance: number }

export type FileNode = {
  name: string
  path: string
  type: 'file' | 'directory'
  size?: number
  modified?: string
  children?: FileNode[]
}

export type BackupTrigger = 'file_change' | 'agent_response' | 'manual' | 'credits_exhausted' | 'interval'
