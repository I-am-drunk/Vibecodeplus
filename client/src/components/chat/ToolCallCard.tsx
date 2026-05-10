import { useState } from 'react'
import { Terminal, FileText, Code, Folder, Search, Wrench, CheckCircle, Loader2, XCircle, ChevronDown, Pencil, Eye, FolderSearch } from 'lucide-react'
import { cn } from '../../lib/utils'

interface ToolCallCardProps {
  name: string
  input: any
  result?: string
  status: 'running' | 'success' | 'error'
}

const TOOL_META: Record<string, { icon: any; color: string; label: string }> = {
  shell: { icon: Terminal, color: '#5ac8fa', label: 'Shell' },
  read: { icon: Eye, color: '#30d158', label: 'Read' },
  write: { icon: Pencil, color: '#ff9f0a', label: 'Write' },
  edit: { icon: Pencil, color: '#ff9f0a', label: 'Edit' },
  glob: { icon: FolderSearch, color: '#bf5af2', label: 'Glob' },
  grep: { icon: Search, color: '#bf5af2', label: 'Grep' },
  code: { icon: Code, color: '#0a84ff', label: 'Code' },
  list: { icon: Folder, color: '#64d2ff', label: 'List' },
  default: { icon: Wrench, color: '#9890a0', label: 'Tool' },
}

function getInputSummary(name: string, input: any): string {
  if (!input) return ''
  if (name === 'shell') return input.command ?? ''
  if (name === 'read') return input.operations?.[0]?.path || input.path || ''
  if (name === 'write' || name === 'edit') return input.path ?? input.file_path ?? ''
  if (name === 'glob') return input.pattern ?? ''
  if (name === 'grep') return input.pattern ?? ''
  if (name === 'code') return input.operation ?? ''
  if (name === 'list') return input.path ?? ''
  const s = JSON.stringify(input)
  return s ? s.substring(0, 80) : ''
}

function formatResult(text: string, maxLen = 300): string {
  const trimmed = text.trim()
  if (trimmed.length <= maxLen) return trimmed
  return trimmed.substring(0, maxLen) + '…'
}

export function ToolCallCard({ name, input, result, status }: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(false)
  const meta = TOOL_META[name] || TOOL_META.default
  const Icon = meta.icon
  const summary = getInputSummary(name, input)
  const safeResult = typeof result === 'string' ? result : result ? JSON.stringify(result) : ''

  const isRunning = status === 'running'
  const isSuccess = status === 'success'
  const isError = status === 'error'

  return (
    <div
      className={cn(
        'group relative rounded-xl border transition-all duration-200',
        'bg-[#0d0d14]/90 backdrop-blur-sm',
        isRunning
          ? 'border-white/[0.08] shadow-[0_0_20px_-5px_rgba(10,132,255,0.15)]'
          : isError
            ? 'border-[#ff453a]/15'
            : 'border-white/[0.04]',
        'hover:border-white/[0.1]',
      )}
    >
      {/* Running glow bar */}
      {isRunning && (
        <div className="absolute top-0 left-3 right-3 h-[1px] overflow-hidden rounded-full">
          <div
            className="h-full w-1/3 rounded-full"
            style={{
              background: `linear-gradient(90deg, transparent, ${meta.color}80, transparent)`,
              animation: 'shimmer 1.5s ease-in-out infinite',
            }}
          />
        </div>
      )}

      <div className="px-3 py-2.5">
        {/* Header row */}
        <div className="flex items-center gap-2.5">
          {/* Icon with status ring */}
          <div className="relative">
            <div
              className="w-6 h-6 rounded-md flex items-center justify-center"
              style={{ background: `${meta.color}15`, border: `1px solid ${meta.color}25` }}
            >
              <Icon size={12} style={{ color: meta.color }} />
            </div>
            {/* Status dot */}
            {isRunning ? (
              <div
                className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full"
                style={{ background: meta.color, animation: 'pulse 1s ease-in-out infinite' }}
              />
            ) : isSuccess ? (
              <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#30d158]" />
            ) : isError ? (
              <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#ff453a]" />
            ) : null}
          </div>

          {/* Tool name + summary */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-semibold tracking-wide" style={{ color: meta.color }}>
                {meta.label}
              </span>
              {summary && (
                <span className="text-[12px] font-mono text-white/40 truncate">
                  {summary}
                </span>
              )}
            </div>
          </div>

          {/* Status indicator */}
          {isRunning ? (
            <Loader2 size={13} className="text-white/30 animate-spin" />
          ) : isSuccess ? (
            <CheckCircle size={13} className="text-[#30d158]/60" />
          ) : isError ? (
            <XCircle size={13} className="text-[#ff453a]/60" />
          ) : null}

          {/* Expand toggle */}
          {safeResult && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="w-5 h-5 rounded flex items-center justify-center text-white/20 hover:text-white/50 hover:bg-white/[0.04] transition-all"
            >
              <ChevronDown
                size={12}
                className={cn('transition-transform duration-200', expanded && 'rotate-180')}
              />
            </button>
          )}
        </div>

        {/* Expanded result */}
        {expanded && safeResult && (
          <div className="mt-2 ml-8.5">
            <div
              className={cn(
                'rounded-lg px-3 py-2 text-[11px] font-mono leading-relaxed max-h-40 overflow-y-auto border',
                isError
                  ? 'text-[#ff453a]/70 bg-[#ff453a]/[0.04] border-[#ff453a]/10'
                  : 'text-white/45 bg-black/30 border-white/[0.04]',
              )}
            >
              {formatResult(safeResult)}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
