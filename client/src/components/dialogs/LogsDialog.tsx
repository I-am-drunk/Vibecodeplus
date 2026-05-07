import { useEffect, useRef, useState, useCallback } from 'react'
import { X, Download, Copy, Check, Trash2 } from 'lucide-react'
import { getLogs, clearLogs, onLogsChange, type LogEntry } from '../../lib/serverLogs'
import { cn } from '../../lib/utils'

const LEVEL_LABEL: Record<number, string> = { 10: 'TRC', 20: 'DBG', 30: 'INF', 40: 'WRN', 50: 'ERR', 60: 'FTL' }
const LEVEL_COLOR: Record<number, string> = {
  10: 'text-[rgba(235,235,245,0.3)]',
  20: 'text-[rgba(235,235,245,0.45)]',
  30: 'text-[#30d158]',
  40: 'text-[#ff9f0a]',
  50: 'text-[#ff453a]',
  60: 'text-[#ff453a]',
}

function formatTime(ts: number) {
  return new Date(ts).toISOString().slice(11, 23)
}

function formatEntry(e: LogEntry): string {
  const extra = Object.entries(e.raw)
    .filter(([k]) => !['time', 'level', 'component', 'msg', 'pid', 'hostname'].includes(k))
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
    .join(' ')
  return `${formatTime(e.time)} [${LEVEL_LABEL[e.level] ?? e.level}] [${e.component}] ${e.msg}${extra ? ' ' + extra : ''}`
}

export function LogsDialog({ onClose }: { onClose: () => void }) {
  const [entries, setEntries] = useState<LogEntry[]>(() => [...getLogs()])
  const [filter, setFilter] = useState('')
  const [copied, setCopied] = useState(false)
  const [autoScroll, setAutoScroll] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    return onLogsChange(() => setEntries([...getLogs()]))
  }, [])

  useEffect(() => {
    if (autoScroll) bottomRef.current?.scrollIntoView()
  }, [entries, autoScroll])

  const filtered = filter
    ? entries.filter(e => formatEntry(e).toLowerCase().includes(filter.toLowerCase()))
    : entries

  const fullText = filtered.map(formatEntry).join('\n')

  const copy = () => {
    navigator.clipboard.writeText(fullText)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const download = () => {
    const blob = new Blob([fullText], { type: 'text/plain' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `vibecode-logs-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const handleScroll = () => {
    const el = scrollRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    setAutoScroll(atBottom)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="w-full max-w-4xl h-[80vh] flex flex-col bg-[#0d0d0d] border border-[rgba(255,255,255,0.1)] rounded-[16px] overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[rgba(255,255,255,0.07)] flex-shrink-0">
          <span className="text-[14px] font-semibold text-white">Debug Logs</span>
          <span className="text-[11px] text-[rgba(235,235,245,0.3)] bg-[rgba(255,255,255,0.06)] px-2 py-0.5 rounded-full">
            {filtered.length} entries
          </span>
          <input
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Filter logs…"
            className="flex-1 bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.08)] rounded-[8px] px-3 h-7 text-[12px] text-white placeholder:text-[rgba(235,235,245,0.25)] focus:outline-none focus:border-[rgba(255,255,255,0.2)]"
          />
          <button onClick={onClose} className="text-[rgba(235,235,245,0.4)] hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Log lines */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto font-mono text-[11px] leading-[1.6] p-3 space-y-px"
        >
          {filtered.length === 0 ? (
            <p className="text-[rgba(235,235,245,0.25)] text-center pt-8">No logs yet</p>
          ) : (
            filtered.map((e, i) => (
              <div key={i} className={cn('flex gap-2 hover:bg-[rgba(255,255,255,0.03)] px-1 rounded', LEVEL_COLOR[e.level] ?? 'text-[rgba(235,235,245,0.6)]')}>
                <span className="text-[rgba(235,235,245,0.25)] flex-shrink-0">{formatTime(e.time)}</span>
                <span className={cn('flex-shrink-0 w-7', LEVEL_COLOR[e.level])}>{LEVEL_LABEL[e.level] ?? e.level}</span>
                <span className="text-[rgba(235,235,245,0.35)] flex-shrink-0">[{e.component}]</span>
                <span className="break-all">{e.msg}
                  {Object.entries(e.raw)
                    .filter(([k]) => !['time', 'level', 'component', 'msg', 'pid', 'hostname'].includes(k))
                    .map(([k, v]) => (
                      <span key={k} className="text-[rgba(235,235,245,0.35)]"> {k}=<span className="text-[rgba(235,235,245,0.55)]">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span></span>
                    ))
                  }
                </span>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 px-4 py-3 border-t border-[rgba(255,255,255,0.07)] flex-shrink-0 bg-[rgba(255,255,255,0.02)]">
          <button
            onClick={() => clearLogs()}
            className="flex items-center gap-1.5 h-8 px-3 rounded-[8px] text-[12px] text-[rgba(235,235,245,0.4)] hover:bg-[rgba(255,255,255,0.07)] hover:text-white transition-colors"
          >
            <Trash2 size={13} /> Clear
          </button>
          <div className="flex-1" />
          {!autoScroll && (
            <button
              onClick={() => { setAutoScroll(true); bottomRef.current?.scrollIntoView() }}
              className="text-[11px] text-[#0a84ff] hover:underline"
            >
              ↓ Jump to bottom
            </button>
          )}
          <button
            onClick={copy}
            className="flex items-center gap-1.5 h-8 px-3 rounded-[8px] text-[12px] text-[rgba(235,235,245,0.6)] hover:bg-[rgba(255,255,255,0.07)] hover:text-white transition-colors border border-[rgba(255,255,255,0.08)]"
          >
            {copied ? <Check size={13} className="text-[#30d158]" /> : <Copy size={13} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button
            onClick={download}
            className="flex items-center gap-1.5 h-8 px-3 rounded-[8px] text-[12px] bg-[#0a84ff] text-white hover:bg-[#409cff] transition-colors font-medium"
          >
            <Download size={13} /> Export
          </button>
        </div>
      </div>
    </div>
  )
}
