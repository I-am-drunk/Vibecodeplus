import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { addClientLog } from './serverLogs'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatRelative(date: string): string {
  if (!date) {
    addClientLog('formatRelative', 'empty date provided')
    return 'Invalid date'
  }
  
  const d = new Date(date)
  
  if (isNaN(d.getTime())) {
    addClientLog('formatRelative', 'invalid date string', { date })
    return 'Invalid date'
  }
  
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const s = Math.floor(diff / 1000)
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  const day = Math.floor(h / 24)
  if (s < 60) return 'just now'
  if (m < 60) return `${m}m ago`
  if (h < 24) return `${h}h ago`
  if (day < 7) return `${day}d ago`
  return d.toLocaleDateString()
}

export const MODELS = [
  { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
  { value: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
]

export function fileLanguage(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    py: 'python', rs: 'rust', go: 'go', rb: 'ruby', java: 'java', cpp: 'cpp',
    c: 'c', cs: 'csharp', php: 'php', swift: 'swift', kt: 'kotlin',
    html: 'html', css: 'css', scss: 'scss', json: 'json', yaml: 'yaml',
    yml: 'yaml', md: 'markdown', sh: 'shell', bash: 'shell', sql: 'sql',
    xml: 'xml', toml: 'toml', dockerfile: 'dockerfile',
  }
  return map[ext] ?? 'plaintext'
}
