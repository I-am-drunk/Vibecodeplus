import { Terminal, FileText, Code, Folder, Search, Wrench, CheckCircle, Loader2, XCircle } from 'lucide-react'
import { cn } from '../../lib/utils'

interface ToolCallCardProps {
  name: string
  input: any
  result?: string
  status: 'running' | 'success' | 'error'
}

const TOOL_ICONS: Record<string, any> = {
  shell: Terminal,
  read: FileText,
  write: Code,
  glob: Search,
  grep: Search,
  code: Folder,
  default: Wrench,
}

const TOOL_COLORS: Record<string, string> = {
  shell: 'text-[#5ac8fa] bg-[#5ac8fa]/10 border-[#5ac8fa]/20',
  read: 'text-[#30d158] bg-[#30d158]/10 border-[#30d158]/20',
  write: 'text-[#ff9f0a] bg-[#ff9f0a]/10 border-[#ff9f0a]/20',
  glob: 'text-[#bf5af2] bg-[#bf5af2]/10 border-[#bf5af2]/20',
  grep: 'text-[#bf5af2] bg-[#bf5af2]/10 border-[#bf5af2]/20',
  code: 'text-[#0a84ff] bg-[#0a84ff]/10 border-[#0a84ff]/20',
  default: 'text-white/40 bg-white/5 border-white/10',
}

export function ToolCallCard({ name, input, result, status }: ToolCallCardProps) {
  const Icon = TOOL_ICONS[name] || TOOL_ICONS.default
  const colorClass = TOOL_COLORS[name] || TOOL_COLORS.default
  
  const getInputSummary = () => {
    if (name === 'shell') return input.command
    if (name === 'read') return input.operations?.[0]?.path || input.path
    if (name === 'write') return `${input.path} (${input.command})`
    if (name === 'glob') return input.pattern
    if (name === 'grep') return input.pattern
    if (name === 'code') return input.operation
    return JSON.stringify(input).substring(0, 60)
  }

  const StatusIcon = status === 'running' ? Loader2 : status === 'success' ? CheckCircle : XCircle
  const statusColor = status === 'running' ? 'text-[#5ac8fa]' : status === 'success' ? 'text-[#30d158]' : 'text-[#ff453a]'

  return (
    <div className="group relative my-2 animate-slide-in">
      <div className={cn(
        'relative rounded-xl border backdrop-blur-xl transition-all',
        'bg-[#0d0d14]/80',
        status === 'running' ? 'border-white/10' : 'border-white/[0.06]',
        'hover:border-white/20'
      )}>
        {/* Glow effect */}
        {status === 'running' && (
          <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-[#0a84ff]/10 via-[#bf5af2]/10 to-[#0a84ff]/10 animate-pulse" />
        )}
        
        <div className="relative p-3">
          {/* Header */}
          <div className="flex items-center gap-2.5 mb-2">
            <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center border', colorClass)}>
              <Icon size={14} />
            </div>
            <span className="text-[13px] font-medium text-white/80">{name}</span>
            <div className="flex-1" />
            <StatusIcon size={14} className={cn(statusColor, status === 'running' && 'animate-spin')} />
          </div>

          {/* Input summary */}
          <div className="pl-9">
            <div className="text-[12px] font-mono text-white/50 bg-black/20 rounded-lg px-2.5 py-1.5 border border-white/[0.04]">
              {getInputSummary()}
            </div>

            {/* Result preview */}
            {result && status === 'success' && (
              <div className="mt-2 text-[11px] font-mono text-[#30d158]/70 bg-[#30d158]/[0.05] rounded-lg px-2.5 py-1.5 border border-[#30d158]/10 max-h-20 overflow-hidden">
                {result.substring(0, 200)}
                {result.length > 200 && '...'}
              </div>
            )}

            {result && status === 'error' && (
              <div className="mt-2 text-[11px] font-mono text-[#ff453a]/70 bg-[#ff453a]/[0.05] rounded-lg px-2.5 py-1.5 border border-[#ff453a]/10">
                {result.substring(0, 200)}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
