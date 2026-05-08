import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Settings, Search, Loader2, CreditCard, AlertCircle, Zap,
  Clock, Trash2, MessageSquare, FolderOpen, Key, Database, Globe,
  Bot, Palette, FileSearch, AppWindow, RefreshCw,
  LayoutGrid, List, ArrowRight, Sparkles, Cpu, Filter, Command, X,
} from 'lucide-react'
import { useProjectsStore, type Project } from '../store/projects'
import { useAuthStore } from '../store/auth'
import { NewProjectDialog } from '../components/dialogs/NewProjectDialog'
import { api } from '../lib/api'
import { cn, formatRelative } from '../lib/utils'

const QUICK_STARTERS = [
  { icon: Globe,      label: 'Web App',     value: 'Build a full-stack web app',         tint: '#0a84ff' },
  { icon: Bot,        label: 'AI Agent',    value: 'Build an AI automation agent',       tint: '#30d158' },
  { icon: Palette,    label: 'Design Tool', value: 'Build a design or UI tool',          tint: '#ff9f0a' },
  { icon: FileSearch, label: 'Research',    value: 'Build a research assistant',         tint: '#5ac8fa' },
  { icon: AppWindow,  label: 'Dashboard',   value: 'Build an analytics dashboard',       tint: '#bf5af2' },
] as const

type Filter = 'all' | 'running' | 'diff' | 'idle'
type ViewMode = 'grid' | 'list'

interface ProjectStats { sessions: number | null }

/* ────────────────────────────────────────────────────────────────────────── */
/* Utility components                                                         */
/* ────────────────────────────────────────────────────────────────────────── */

function StatTile({
  label, value, tint, active, onClick, icon: Icon,
}: {
  label: string
  value: number | string
  tint: string
  active?: boolean
  onClick?: () => void
  icon: React.ComponentType<{ size?: number; className?: string }>
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group relative flex-1 min-w-[160px] rounded-2xl px-4 py-3.5 text-left transition-all overflow-hidden border',
        'hover:bg-white/[0.04] hover:border-white/[0.12]',
        active ? 'bg-white/[0.05] border-white/[0.14] shadow-[0_0_0_1px_rgba(255,255,255,0.04)_inset]' : 'bg-white/[0.02] border-white/[0.06]',
      )}
    >
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
        style={{ background: `radial-gradient(60% 80% at 0% 0%, ${tint}15, transparent 60%)` }}
      />
      <div className="relative flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/40">{label}</div>
          <div className="mt-1.5 text-[26px] font-bold tabular-nums text-white leading-none tracking-tight">{value}</div>
        </div>
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: `${tint}18`, border: `1px solid ${tint}30` }}
        >
          <Icon size={14} className="text-white" />
        </div>
      </div>
    </button>
  )
}

function ProjectAvatar({ name, size = 12 }: { name: string; size?: number }) {
  // Hash → hue
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  const hue = h % 360
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(s => s[0]?.toUpperCase() ?? '')
    .join('') || '?'
  return (
    <div
      className="rounded-[10px] flex items-center justify-center font-bold text-white/95 flex-shrink-0"
      style={{
        width: size * 4,
        height: size * 4,
        fontSize: size * 1.25,
        background: `linear-gradient(135deg, hsl(${hue} 60% 22%) 0%, hsl(${(hue + 40) % 360} 55% 14%) 100%)`,
        border: `1px solid hsl(${hue} 50% 28% / 0.6)`,
        boxShadow: `0 0 20px hsl(${hue} 70% 35% / 0.18) inset`,
      }}
    >
      {initials}
    </div>
  )
}

function StatusDot({ kind }: { kind: 'running' | 'idle' | 'diff' }) {
  const color =
    kind === 'running' ? '#30d158'
    : kind === 'diff' ? '#ff9f0a'
    : '#71717a'
  return (
    <span className="relative inline-flex h-2 w-2 flex-shrink-0">
      {kind === 'running' && (
        <span className="absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping" style={{ background: color }} />
      )}
      <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: color }} />
    </span>
  )
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Project Card                                                               */
/* ────────────────────────────────────────────────────────────────────────── */

interface ProjectCardProps {
  project: Project
  stats: ProjectStats
  onOpen: (p: Project) => void
  onDelete: (id: string) => void
  viewMode: ViewMode
}

function ProjectCard({ project, stats, onOpen, onDelete, viewMode }: ProjectCardProps) {
  const [opening, setOpening] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const isRunning = (project.sandbox?.status ?? 'stopped') === 'running'
  const isDiff = project.differentKey
  const kind: 'running' | 'idle' | 'diff' = isDiff ? 'diff' : isRunning ? 'running' : 'idle'

  const handleOpen = async () => {
    if (opening || deleting) return
    setOpening(true)
    try { await onOpen(project) } finally { setOpening(false) }
  }

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (deleting || opening) return
    if (!confirm(`Delete "${project.name || 'this project'}"? This cannot be undone.`)) return
    setDeleting(true)
    try { await onDelete(project.id) } finally { setDeleting(false) }
  }

  if (viewMode === 'list') {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={handleOpen}
        onKeyDown={(e) => { if (e.key === 'Enter') handleOpen() }}
        className={cn(
          'group relative flex items-center gap-4 px-4 py-3 rounded-xl border transition-all cursor-pointer overflow-hidden',
          isDiff
            ? 'border-[#ff9f0a]/25 bg-[#ff9f0a]/[0.03] hover:bg-[#ff9f0a]/[0.06]'
            : isRunning
            ? 'border-[#30d158]/20 bg-[#30d158]/[0.02] hover:bg-[#30d158]/[0.05]'
            : 'border-white/[0.06] bg-white/[0.015] hover:bg-white/[0.04] hover:border-white/[0.12]',
          (opening || deleting) && 'opacity-50 pointer-events-none',
        )}
      >
        <ProjectAvatar name={project.name || 'Untitled'} size={10} />
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="text-[14px] font-semibold text-white truncate">{project.name || 'Untitled Project'}</h3>
            <StatusDot kind={kind} />
            {isDiff && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-[#ff9f0a]/15 text-[#ff9f0a]">Migrate</span>}
          </div>
          <p className="text-[12px] text-white/40 truncate mt-0.5">{project.description || project.defaultModel || 'No description'}</p>
        </div>
        <div className="hidden lg:flex items-center gap-5 text-[11.5px] text-white/35">
          <div className="flex items-center gap-1.5 w-24"><Cpu size={11} className="text-white/25" /><span className="truncate">{project.defaultModel?.split('-').slice(0, 2).join('-') ?? '—'}</span></div>
          <div className="flex items-center gap-1.5 w-20"><MessageSquare size={11} className="text-white/25" />{stats.sessions ?? '—'}</div>
          <div className="flex items-center gap-1.5 w-28"><Clock size={11} className="text-white/25" />{project.lastOpenedAt ? formatRelative(project.lastOpenedAt) : 'Never'}</div>
          <div className="flex items-center gap-1.5 w-32">
            {project.snapshotAt && (
              <>
                <Database size={11} className="text-[#30d158]/60" />
                <span className="text-[#30d158]/70 truncate">{formatRelative(project.snapshotAt)}</span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="w-8 h-8 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-[#ff453a]/15 hover:text-[#ff453a] text-white/30 transition-all"
            aria-label="Delete project"
          >
            {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
          </button>
          <div
            className={cn(
              'h-8 px-3 rounded-lg flex items-center gap-1.5 text-[12px] font-bold transition-all',
              isDiff ? 'bg-[#ff9f0a]/12 text-[#ff9f0a]' : 'bg-white/[0.06] text-white/70 group-hover:bg-[#0a84ff]/15 group-hover:text-[#409cff]',
            )}
          >
            {isDiff ? 'Migrate' : opening ? 'Opening' : 'Open'}
            <ArrowRight size={11} className="-mr-0.5" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleOpen}
      onKeyDown={(e) => { if (e.key === 'Enter') handleOpen() }}
      className={cn(
        'group relative rounded-2xl border transition-all duration-300 cursor-pointer overflow-hidden flex flex-col',
        'hover:-translate-y-[2px]',
        isDiff
          ? 'border-[#ff9f0a]/25 bg-[#0c0c0e] hover:border-[#ff9f0a]/45 hover:shadow-[0_18px_60px_-20px_rgba(255,159,10,0.35)]'
          : isRunning
          ? 'border-[#30d158]/20 bg-[#0c0c0e] hover:border-[#30d158]/40 hover:shadow-[0_18px_60px_-20px_rgba(48,209,88,0.30)]'
          : 'border-white/[0.06] bg-[#0c0c0e] hover:border-white/[0.16] hover:shadow-[0_18px_60px_-20px_rgba(10,132,255,0.20)]',
        (opening || deleting) && 'opacity-50 pointer-events-none',
      )}
    >
      {/* Ambient tint */}
      <div
        className="absolute inset-0 pointer-events-none opacity-60"
        style={{
          background: isDiff
            ? 'radial-gradient(120% 60% at 0% 0%, rgba(255,159,10,0.08), transparent 60%)'
            : isRunning
            ? 'radial-gradient(120% 60% at 0% 0%, rgba(48,209,88,0.06), transparent 60%)'
            : 'radial-gradient(120% 60% at 0% 0%, rgba(255,255,255,0.03), transparent 60%)',
        }}
      />

      {/* Diff key top bar */}
      {isDiff && (
        <div className="relative flex items-center justify-center gap-1.5 py-1.5 bg-[#ff9f0a]/[0.10] border-b border-[#ff9f0a]/20">
          <Key size={10} className="text-[#ff9f0a]" />
          <span className="text-[10px] font-bold text-[#ff9f0a] uppercase tracking-[0.18em]">Migration required</span>
        </div>
      )}

      <button
        onClick={handleDelete}
        disabled={deleting}
        className="absolute top-3 right-3 z-10 w-8 h-8 rounded-lg bg-black/50 backdrop-blur-md border border-white/[0.06] flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-[#ff453a]/15 hover:border-[#ff453a]/30 hover:text-[#ff453a] text-white/45 transition-all"
        aria-label="Delete project"
        style={isDiff ? { top: 38 } : undefined}
      >
        {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
      </button>

      <div className="relative p-5 flex-1 flex flex-col">
        <div className="flex items-start gap-3.5 mb-3">
          <ProjectAvatar name={project.name || 'Untitled'} size={11} />
          <div className="flex-1 min-w-0 mt-0.5">
            <h3 className="text-[15.5px] font-semibold text-white/95 truncate tracking-tight">
              {project.name || 'Untitled Project'}
            </h3>
            <div className="flex items-center gap-2 mt-1">
              <StatusDot kind={kind} />
              <span
                className={cn(
                  'text-[11px] font-medium',
                  kind === 'running' ? 'text-[#30d158]' : kind === 'diff' ? 'text-[#ff9f0a]' : 'text-white/35',
                )}
              >
                {kind === 'running' ? 'Live sandbox' : kind === 'diff' ? 'Awaiting migration' : 'Idle'}
              </span>
            </div>
          </div>
        </div>

        <p className="text-[12.5px] text-white/45 leading-relaxed line-clamp-2 mb-4 flex-1 min-h-[36px]">
          {project.description || 'No description provided.'}
        </p>

        {/* Meta row */}
        <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-white/45 mb-3">
          {project.defaultModel && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white/[0.04] border border-white/[0.06] font-mono text-[10.5px]">
              <Cpu size={10} className="text-white/35" />
              {project.defaultModel.split('-').slice(0, 3).join('-')}
            </span>
          )}
          {stats.sessions !== null && stats.sessions > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white/[0.04] border border-white/[0.06]">
              <MessageSquare size={10} className="text-white/35" />
              {stats.sessions} {stats.sessions === 1 ? 'session' : 'sessions'}
            </span>
          )}
          {project.snapshotAt && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[#30d158]/[0.06] border border-[#30d158]/15 text-[#30d158]/80">
              <Database size={10} />
              Snapshot
            </span>
          )}
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-white/[0.05]">
          <div className="flex items-center gap-1.5 text-[11px] text-white/35">
            <Clock size={11} className="text-white/25" />
            {project.lastOpenedAt ? formatRelative(project.lastOpenedAt) : 'Never opened'}
          </div>
          <div
            className={cn(
              'h-7 px-2.5 rounded-lg flex items-center gap-1 text-[11.5px] font-bold transition-all',
              isDiff
                ? 'bg-[#ff9f0a]/12 text-[#ff9f0a]'
                : 'bg-white/[0.04] text-white/55 group-hover:bg-[#0a84ff]/15 group-hover:text-[#409cff]',
            )}
          >
            {isDiff ? 'Migrate' : opening ? 'Opening' : 'Open'}
            <ArrowRight size={11} className="-mr-0.5" />
          </div>
        </div>
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Dashboard Page                                                             */
/* ────────────────────────────────────────────────────────────────────────── */

export function DashboardPage() {
  const navigate = useNavigate()
  const { projects, load, loading } = useProjectsStore()
  const { apiKey, user, credits, initFromServer } = useAuthStore()

  const [showNew, setShowNew] = useState(false)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [stats, setStats] = useState<Record<string, ProjectStats>>({})
  const [refreshing, setRefreshing] = useState(false)

  const searchRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    initFromServer().catch(() => {})
    load().catch(() => {})
  }, [])

  // Lazy-load session counts in parallel
  useEffect(() => {
    let cancelled = false
    const missing = projects.filter(p => stats[p.id] === undefined)
    if (missing.length === 0) return
    void Promise.all(
      missing.map(async p => {
        try {
          const { sessions } = await api.listSessions(p.id)
          return [p.id, { sessions: sessions.length }] as const
        } catch {
          return [p.id, { sessions: null }] as const
        }
      }),
    ).then(entries => {
      if (cancelled) return
      setStats(prev => {
        const next = { ...prev }
        for (const [id, s] of entries) next[id] = s
        return next
      })
    })
    return () => { cancelled = true }
  }, [projects, stats])

  // Cmd/Ctrl+K → focus search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        searchRef.current?.focus()
      } else if (e.key === 'Escape' && document.activeElement === searchRef.current) {
        searchRef.current?.blur()
        if (search) setSearch('')
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [search])

  const handleOpen = useCallback(async (project: Project) => {
    if (!apiKey) { navigate('/settings'); return }
    navigate(`/workspace/${project.id}`)
  }, [navigate, apiKey])

  const handleDelete = useCallback(async (id: string) => {
    try { await useProjectsStore.getState().deleteProject(id) } catch { /* ignore */ }
  }, [])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    try { await load() } finally { setRefreshing(false) }
  }, [load])

  const runningCount = useMemo(
    () => projects.filter(p => p.sandbox?.status === 'running' && !p.differentKey).length,
    [projects],
  )
  const diffKeyProjects = useMemo(() => projects.filter(p => p.differentKey), [projects])
  const diffKeyCount = diffKeyProjects.length
  const idleCount = useMemo(
    () => projects.filter(p => (p.sandbox?.status ?? 'stopped') !== 'running' && !p.differentKey).length,
    [projects],
  )

  const filtered = useMemo(() => {
    const s = search.toLowerCase()
    return projects
      .filter(p => {
        if (s && !(p.name?.toLowerCase().includes(s) || p.description?.toLowerCase().includes(s))) return false
        if (filter === 'running') return p.sandbox?.status === 'running' && !p.differentKey
        if (filter === 'diff') return p.differentKey
        if (filter === 'idle') return (p.sandbox?.status ?? 'stopped') !== 'running' && !p.differentKey
        return true
      })
      .sort((a, b) => {
        // Migrations to top, then running, then most recent
        if (a.differentKey !== b.differentKey) return a.differentKey ? -1 : 1
        const ar = a.sandbox?.status === 'running' ? 1 : 0
        const br = b.sandbox?.status === 'running' ? 1 : 0
        if (ar !== br) return br - ar
        const at = a.lastOpenedAt ? new Date(a.lastOpenedAt).getTime() : 0
        const bt = b.lastOpenedAt ? new Date(b.lastOpenedAt).getTime() : 0
        return bt - at
      })
  }, [projects, search, filter])

  const creditsCritical = !!credits && credits.balance <= 0
  const creditsLow = !!credits && credits.balance < 5

  const isFirstLoad = loading && projects.length === 0
  const isEmptyState = projects.length === 0 && !loading

  const greeting = useMemo(() => {
    const h = new Date().getHours()
    if (h < 5) return 'Working late'
    if (h < 12) return 'Good morning'
    if (h < 18) return 'Good afternoon'
    return 'Good evening'
  }, [])
  const firstName = user?.name?.split(/\s+/)[0] || user?.email?.split('@')[0] || 'builder'

  return (
    <div className="h-dvh flex flex-col bg-[#050507] text-white overflow-hidden font-sans selection:bg-[#0a84ff]/30">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-white/[0.04] bg-[#050507]/85 backdrop-blur-2xl z-20">
        <div className="max-w-[1480px] mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-[9px] bg-gradient-to-tr from-[#0a84ff] to-[#409cff] flex items-center justify-center shadow-[0_0_18px_rgba(10,132,255,0.4)]">
              <Zap size={14} className="text-white fill-white/30" strokeWidth={2.5} />
            </div>
            <span className="text-[14px] font-bold text-white/95 tracking-tight">Vibecode Studio</span>
            <span className="hidden sm:inline-flex items-center gap-1 ml-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-white/[0.05] text-white/40 border border-white/[0.05]">
              Beta
            </span>
          </div>

          <div className="flex items-center gap-2">
            {!apiKey && (
              <button
                onClick={() => navigate('/settings')}
                className="flex items-center gap-1.5 h-8 px-3 rounded-full bg-[#ff9f0a]/10 border border-[#ff9f0a]/25 text-[12px] font-bold text-[#ff9f0a] hover:bg-[#ff9f0a]/15 transition-all"
              >
                <AlertCircle size={13} strokeWidth={2.5} />
                Add API Key
              </button>
            )}
            {credits && (
              <button
                onClick={() => navigate('/settings')}
                className={cn(
                  'flex items-center gap-1.5 h-8 px-3 rounded-full border text-[12px] font-bold tabular-nums transition-all',
                  creditsCritical
                    ? 'bg-[#ff453a]/10 border-[#ff453a]/30 text-[#ff453a]'
                    : creditsLow
                    ? 'bg-[#ff9f0a]/10 border-[#ff9f0a]/30 text-[#ff9f0a]'
                    : 'bg-white/[0.03] border-white/[0.08] text-white/65 hover:text-white hover:bg-white/[0.06]',
                )}
              >
                <CreditCard size={13} strokeWidth={2} />
                ${credits.balance.toFixed(2)}
              </button>
            )}
            <button
              onClick={() => navigate('/settings')}
              className="w-8 h-8 rounded-full hover:bg-white/[0.06] text-white/45 hover:text-white transition-all flex items-center justify-center"
              aria-label="Settings"
            >
              <Settings size={15} strokeWidth={2} />
            </button>
            {user && (
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold text-black shadow-[0_0_15px_rgba(48,209,88,0.2)] ml-1"
                style={{ background: 'linear-gradient(135deg, #30d158 0%, #5ce675 100%)' }}
                title={user.email}
              >
                {(user.name?.[0] || user.email?.[0])?.toUpperCase() ?? 'V'}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 overflow-y-auto custom-scrollbar relative">
        {/* Ambient gradient */}
        <div className="absolute top-0 left-0 right-0 h-[420px] pointer-events-none overflow-hidden">
          <div className="absolute -top-40 left-1/3 w-[640px] h-[640px] rounded-full opacity-[0.07] blur-[100px] bg-[#0a84ff]" />
          <div className="absolute -top-20 right-10 w-[420px] h-[420px] rounded-full opacity-[0.05] blur-[100px] bg-[#30d158]" />
        </div>

        {isFirstLoad ? (
          <LoadingState />
        ) : isEmptyState ? (
          <EmptyState onCreate={() => setShowNew(true)} />
        ) : (
          <div className="relative max-w-[1480px] mx-auto px-6 py-8">
            {/* Hero */}
            <section className="flex flex-col gap-4 mb-8">
              <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-white/45 mb-1.5">
                    {greeting}, <span className="text-white/75">{firstName}</span>.
                  </p>
                  <h1 className="text-[34px] sm:text-[40px] font-bold text-white tracking-tight leading-[1.05] text-balance">
                    Pick up where{' '}
                    <span className="bg-gradient-to-r from-white via-white to-white/55 bg-clip-text text-transparent">
                      you left off
                    </span>
                  </h1>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={handleRefresh}
                    disabled={refreshing}
                    className="h-10 w-10 rounded-xl border border-white/[0.08] bg-white/[0.02] text-white/55 hover:text-white hover:bg-white/[0.05] transition-all flex items-center justify-center disabled:opacity-50"
                    aria-label="Refresh"
                  >
                    <RefreshCw size={14} className={cn(refreshing && 'animate-spin')} />
                  </button>
                  <button
                    onClick={() => setShowNew(true)}
                    className="flex items-center gap-2 h-10 px-4 rounded-xl text-[13.5px] font-bold text-black bg-white hover:bg-white/95 transition-all shadow-[0_4px_22px_rgba(255,255,255,0.10)] active:scale-[0.98]"
                  >
                    <Plus size={15} strokeWidth={2.75} />
                    New Project
                  </button>
                </div>
              </div>

              {/* Stat tiles */}
              <div className="flex flex-wrap gap-3">
                <StatTile
                  label="All projects"
                  value={projects.length}
                  tint="#0a84ff"
                  icon={FolderOpen}
                  active={filter === 'all'}
                  onClick={() => setFilter('all')}
                />
                <StatTile
                  label="Live sandboxes"
                  value={runningCount}
                  tint="#30d158"
                  icon={Zap}
                  active={filter === 'running'}
                  onClick={() => setFilter('running')}
                />
                <StatTile
                  label="Awaiting migration"
                  value={diffKeyCount}
                  tint="#ff9f0a"
                  icon={Key}
                  active={filter === 'diff'}
                  onClick={() => setFilter('diff')}
                />
                <StatTile
                  label="Idle"
                  value={idleCount}
                  tint="#71717a"
                  icon={Clock}
                  active={filter === 'idle'}
                  onClick={() => setFilter('idle')}
                />
              </div>
            </section>

            {/* Migration priority strip */}
            {diffKeyCount > 0 && filter !== 'diff' && (
              <MigrationStrip
                projects={diffKeyProjects}
                onOpen={handleOpen}
                onShowAll={() => setFilter('diff')}
              />
            )}

            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
              <div className="flex items-center gap-1 p-1 bg-white/[0.02] border border-white/[0.05] rounded-xl">
                {([
                  { v: 'all',     label: 'All',     icon: Filter, count: 0,            tint: '#0a84ff' },
                  { v: 'running', label: 'Active',  icon: Zap,    count: runningCount, tint: '#30d158' },
                  { v: 'diff',    label: 'Migrate', icon: Key,    count: diffKeyCount, tint: '#ff9f0a' },
                  { v: 'idle',    label: 'Idle',    icon: Clock,  count: idleCount,    tint: '#71717a' },
                ] as const).map((b) => (
                  <button
                    key={b.v}
                    onClick={() => setFilter(b.v)}
                    className={cn(
                      'h-8 px-3 rounded-lg text-[12.5px] font-semibold transition-all flex items-center gap-1.5',
                      filter === b.v
                        ? 'bg-white/[0.08] text-white shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset]'
                        : 'text-white/45 hover:text-white/85',
                    )}
                  >
                    <b.icon size={12} style={filter === b.v ? { color: b.tint } : undefined} />
                    {b.label}
                    {b.v !== 'all' && b.count > 0 && (
                      <span
                        className="ml-0.5 px-1.5 py-px rounded text-[10px] font-bold tabular-nums"
                        style={{ background: `${b.tint}20`, color: b.tint }}
                      >
                        {b.count}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <div className="relative group flex-1 sm:w-72">
                  <Search size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30 group-focus-within:text-[#0a84ff] transition-colors pointer-events-none" />
                  <input
                    ref={searchRef}
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search projects…"
                    className="h-10 w-full pl-9 pr-20 bg-white/[0.02] border border-white/[0.06] rounded-xl text-[13px] font-medium text-white placeholder:text-white/30 focus:outline-none focus:border-[#0a84ff]/50 focus:bg-white/[0.04] transition-all"
                  />
                  {search ? (
                    <button
                      onClick={() => setSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-lg flex items-center justify-center text-white/35 hover:text-white hover:bg-white/[0.06]"
                      aria-label="Clear search"
                    >
                      <X size={13} />
                    </button>
                  ) : (
                    <kbd className="hidden sm:flex absolute right-2.5 top-1/2 -translate-y-1/2 items-center gap-0.5 px-1.5 h-5 rounded-md text-[10px] font-mono text-white/30 bg-white/[0.04] border border-white/[0.06]">
                      <Command size={9} /> K
                    </kbd>
                  )}
                </div>

                <div className="hidden sm:flex items-center bg-white/[0.02] p-1 rounded-xl border border-white/[0.06]">
                  <button
                    onClick={() => setViewMode('grid')}
                    aria-label="Grid view"
                    className={cn('p-1.5 rounded-lg transition-colors', viewMode === 'grid' ? 'bg-white/[0.08] text-white' : 'text-white/35 hover:text-white/65')}
                  >
                    <LayoutGrid size={15} />
                  </button>
                  <button
                    onClick={() => setViewMode('list')}
                    aria-label="List view"
                    className={cn('p-1.5 rounded-lg transition-colors', viewMode === 'list' ? 'bg-white/[0.08] text-white' : 'text-white/35 hover:text-white/65')}
                  >
                    <List size={15} />
                  </button>
                </div>
              </div>
            </div>

            {/* Results */}
            {filtered.length === 0 ? (
              <NoResultsState
                search={search}
                hasFilter={filter !== 'all'}
                onClear={() => { setSearch(''); setFilter('all') }}
              />
            ) : (
              <div
                className={cn(
                  'grid gap-3.5',
                  viewMode === 'grid'
                    ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
                    : 'grid-cols-1',
                )}
              >
                {filtered.map(p => (
                  <ProjectCard
                    key={p.id}
                    project={p}
                    stats={stats[p.id] ?? { sessions: null }}
                    onOpen={handleOpen}
                    onDelete={handleDelete}
                    viewMode={viewMode}
                  />
                ))}
              </div>
            )}

            {/* Footer marker */}
            <div className="mt-12 flex items-center justify-center text-[11px] text-white/25">
              <span>{filtered.length} of {projects.length} project{projects.length === 1 ? '' : 's'}</span>
            </div>
          </div>
        )}
      </main>

      <NewProjectDialog open={showNew} onClose={() => setShowNew(false)} />
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Sub-sections                                                               */
/* ────────────────────────────────────────────────────────────────────────── */

function MigrationStrip({
  projects, onOpen, onShowAll,
}: {
  projects: Project[]
  onOpen: (p: Project) => void
  onShowAll: () => void
}) {
  return (
    <section className="mb-7">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="relative w-7 h-7 rounded-lg bg-[#ff9f0a]/15 border border-[#ff9f0a]/25 flex items-center justify-center">
            <Key size={13} className="text-[#ff9f0a]" />
            <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-[#ff9f0a] border-2 border-[#050507] flex items-center justify-center">
              <span className="absolute inline-flex h-full w-full rounded-full bg-[#ff9f0a] opacity-60 animate-ping" />
            </span>
          </div>
          <div>
            <h2 className="text-[14px] font-bold text-white">Migration required</h2>
            <p className="text-[11.5px] text-white/40">
              {projects.length} project{projects.length === 1 ? '' : 's'} bound to a previous API key
            </p>
          </div>
        </div>
        <button
          onClick={onShowAll}
          className="text-[12px] font-semibold text-[#ff9f0a] hover:text-[#ffb340] transition-colors flex items-center gap-1"
        >
          View all <ArrowRight size={11} />
        </button>
      </div>

      <div className="flex gap-3 overflow-x-auto custom-scrollbar pb-2 -mx-1 px-1 snap-x">
        {projects.slice(0, 6).map(p => (
          <button
            key={p.id}
            onClick={() => onOpen(p)}
            className="group relative snap-start flex-shrink-0 w-[300px] text-left rounded-2xl border border-[#ff9f0a]/20 bg-[#0c0c0e] hover:border-[#ff9f0a]/40 hover:-translate-y-[2px] hover:shadow-[0_18px_60px_-20px_rgba(255,159,10,0.40)] overflow-hidden transition-all"
          >
            <div className="absolute inset-0 pointer-events-none opacity-100" style={{ background: 'radial-gradient(120% 70% at 0% 0%, rgba(255,159,10,0.10), transparent 60%)' }} />
            <div className="relative p-4">
              <div className="flex items-start gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-[#ff9f0a]/15 border border-[#ff9f0a]/25 flex items-center justify-center flex-shrink-0">
                  <Key size={16} className="text-[#ff9f0a]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-semibold text-white truncate">{p.name || 'Untitled'}</div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#ff9f0a]">Locked</span>
                    {p.snapshotAt && (
                      <>
                        <span className="w-0.5 h-0.5 rounded-full bg-white/20" />
                        <span className="text-[10.5px] text-[#30d158]/80 truncate">
                          Snapshot {formatRelative(p.snapshotAt)}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-white/35">
                  {p.lastOpenedAt ? `Opened ${formatRelative(p.lastOpenedAt)}` : 'Never opened'}
                </span>
                <div
                  className="h-7 px-2.5 rounded-lg flex items-center gap-1 text-[11.5px] font-bold bg-[#ff9f0a]/15 text-[#ff9f0a] group-hover:bg-[#ff9f0a]/25 transition-all"
                >
                  Migrate <ArrowRight size={11} />
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>
    </section>
  )
}

function LoadingState() {
  return (
    <div className="relative flex flex-col items-center justify-center min-h-[60vh] gap-3">
      <Loader2 size={28} className="text-[#0a84ff] animate-spin" />
      <p className="text-[13px] font-medium text-white/40">Loading workspace…</p>
    </div>
  )
}

function NoResultsState({
  search, hasFilter, onClear,
}: { search: string; hasFilter: boolean; onClear: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center border border-dashed border-white/[0.06] rounded-3xl bg-white/[0.01]">
      <div className="w-14 h-14 rounded-2xl bg-white/[0.03] border border-white/[0.04] flex items-center justify-center mb-4">
        <Search size={20} className="text-white/30" />
      </div>
      <h3 className="text-[16px] font-bold text-white/85 mb-1.5">No matches</h3>
      <p className="text-[13px] text-white/40 max-w-sm leading-relaxed">
        {search
          ? <>We couldn’t find anything for <span className="font-medium text-white/65">“{search}”</span>.</>
          : <>No projects match the current filter.</>}
      </p>
      {(search || hasFilter) && (
        <button
          onClick={onClear}
          className="mt-5 h-9 px-4 rounded-lg text-[12.5px] font-bold text-[#0a84ff] hover:text-[#409cff] hover:bg-[#0a84ff]/[0.08] transition-all"
        >
          Clear all filters
        </button>
      )}
    </div>
  )
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="relative flex flex-col items-center justify-center min-h-[80vh] px-6 py-16 animate-fade-in">
      <div className="text-center max-w-2xl mx-auto flex flex-col items-center">
        <div className="relative mb-7">
          <div className="absolute inset-0 bg-[#0a84ff] blur-[80px] opacity-25 rounded-full" />
          <div className="w-24 h-24 rounded-[28px] bg-gradient-to-br from-[#141417] to-[#050507] border border-white/[0.10] shadow-[0_24px_60px_rgba(0,0,0,0.5)] flex items-center justify-center relative z-10">
            <Sparkles size={36} className="text-[#0a84ff]" strokeWidth={1.5} />
          </div>
        </div>

        <h1 className="text-[34px] sm:text-[40px] font-bold text-white tracking-tight mb-3 text-balance">
          Your studio is ready
        </h1>
        <p className="text-[15px] text-white/45 leading-relaxed mb-9 max-w-md text-pretty">
          Spin up a sandboxed workspace, chat with the agent, and ship fast — every change is snapshotted, so nothing is ever lost.
        </p>

        <button
          onClick={onCreate}
          className="inline-flex items-center gap-2.5 h-12 px-7 rounded-full bg-white text-black text-[15px] font-bold transition-all hover:scale-[1.02] active:scale-[0.98] shadow-[0_0_30px_rgba(255,255,255,0.18)] mb-12"
        >
          <Plus size={16} strokeWidth={3} />
          Create your first project
        </button>

        <div className="w-full text-left">
          <p className="text-[11px] font-bold text-white/25 uppercase tracking-[0.18em] mb-3 ml-1">Quick starters</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {QUICK_STARTERS.map(s => (
              <button
                key={s.label}
                onClick={onCreate}
                className="group relative flex items-start gap-3 p-4 bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.05] hover:border-white/[0.12] rounded-2xl transition-all text-left overflow-hidden"
              >
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                  style={{ background: `radial-gradient(80% 80% at 0% 0%, ${s.tint}15, transparent 70%)` }}
                />
                <div
                  className="relative w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-105"
                  style={{ background: `${s.tint}18`, border: `1px solid ${s.tint}30` }}
                >
                  <s.icon size={16} style={{ color: s.tint }} />
                </div>
                <div className="relative min-w-0">
                  <span className="block text-[13.5px] font-semibold text-white/85 group-hover:text-white">
                    {s.label}
                  </span>
                  <span className="block text-[11.5px] text-white/40 group-hover:text-white/55 mt-0.5 truncate">
                    {s.value}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
