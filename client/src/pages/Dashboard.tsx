import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Settings, Search, Loader2, CreditCard, AlertCircle, Zap,
  Clock, Trash2, MessageSquare, FolderOpen, Key, Database, Globe,
  Bot, Palette, FileSearch, AppWindow, CheckCircle, RefreshCw
} from 'lucide-react'
import { useProjectsStore, type Project } from '../store/projects'
import { useAuthStore } from '../store/auth'
import { NewProjectDialog } from '../components/dialogs/NewProjectDialog'
import { api } from '../lib/api'
import { cn, formatRelative } from '../lib/utils'

const QUICK_STARTERS = [
  { icon: Globe, label: 'Web App', value: 'Build a full-stack web app' },
  { icon: Bot, label: 'AI Agent', value: 'Build an AI automation agent' },
  { icon: Palette, label: 'Design Tool', value: 'Build a design or UI tool' },
  { icon: FileSearch, label: 'Research', value: 'Build a research assistant' },
  { icon: AppWindow, label: 'Dashboard', value: 'Build an analytics dashboard' },
]

interface ProjectCardProps {
  project: Project
  onOpen: (p: Project) => void
  onDelete: (id: string) => void
}

function ProjectCard({ project, onOpen, onDelete }: ProjectCardProps) {
  const [opening, setOpening] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [sessions, setSessions] = useState<number | null>(null)

  const status = project.sandbox?.status ?? 'stopped'
  const isRunning = status === 'running'
  const isDiff = project.differentKey

  useEffect(() => {
    api.listSessions(project.id).then(({ sessions: s }) => setSessions(s.length)).catch(() => {})
  }, [project.id])

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

  const snapshotLabel = project.snapshotAt
    ? `Saved ${formatRelative(project.snapshotAt)}`
    : null

  return (
    <div
      className={cn(
        'group relative rounded-2xl border transition-all duration-200 cursor-pointer overflow-hidden',
        isRunning && !isDiff && 'border-[#30d158]/20 hover:border-[#30d158]/40 hover:shadow-[0_0_40px_rgba(48,209,88,0.07)]',
        isDiff && 'border-[#ff9f0a]/20 hover:border-[#ff9f0a]/35',
        !isRunning && !isDiff && 'border-white/[0.08] hover:border-white/[0.16]',
        (opening || deleting) && 'opacity-50 pointer-events-none'
      )}
      onClick={handleOpen}
    >
      {/* Background */}
      <div className={cn(
        'absolute inset-0',
        isRunning && !isDiff && 'bg-gradient-to-br from-[#0a1a0e] via-[#0a0a0a] to-[#0a0a0a]',
        isDiff && 'bg-gradient-to-br from-[#1a1200] via-[#0a0a0a] to-[#0a0a0a]',
        !isRunning && !isDiff && 'bg-gradient-to-br from-[#111113] via-[#0d0d0d] to-[#0a0a0a]'
      )} />

      {/* Different key banner */}
      {isDiff && (
        <div className="relative flex items-center gap-2 px-4 py-2 bg-[#ff9f0a]/[0.08] border-b border-[#ff9f0a]/15">
          <Key size={11} className="text-[#ff9f0a]" />
          <span className="text-[11px] text-[#ff9f0a] font-medium">Created with a different API key</span>
        </div>
      )}

      {/* Delete button */}
      <button
        onClick={handleDelete}
        disabled={deleting}
        className="absolute top-3 right-3 z-10 w-7 h-7 rounded-lg bg-black/50 backdrop-blur-sm border border-white/[0.08]
          flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-[#ff453a]/20 hover:border-[#ff453a]/25
          hover:text-[#ff453a] text-white/25 transition-all"
      >
        {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
      </button>

      {/* Main content */}
      <div className="relative p-5">
        {/* Icon + Status */}
        <div className="flex items-start gap-3.5 mb-4">
          <div className={cn(
            'w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 transition-all',
            isRunning && !isDiff && 'bg-[#30d158]/15 text-[#30d158]',
            isDiff && 'bg-[#ff9f0a]/15 text-[#ff9f0a]',
            !isRunning && !isDiff && 'bg-white/[0.05] text-white/30 group-hover:text-white/50'
          )}>
            <FolderOpen size={19} strokeWidth={1.8} />
          </div>
          <div className="flex-1 min-w-0 pr-6">
            <div className="flex items-center gap-2 mb-0.5">
              <h3 className="text-[15px] font-semibold text-white truncate">
                {project.name || 'Unnamed Project'}
              </h3>
              <span className={cn(
                'flex-shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium',
                isRunning && !isDiff && 'bg-[#30d158]/15 text-[#30d158]',
                isDiff && 'bg-[#ff9f0a]/15 text-[#ff9f0a]',
                !isRunning && !isDiff && 'bg-white/[0.06] text-white/30'
              )}>
                <span className={cn(
                  'w-1 h-1 rounded-full',
                  isRunning && !isDiff && 'bg-[#30d158]',
                  isDiff && 'bg-[#ff9f0a]',
                  !isRunning && !isDiff && 'bg-white/30'
                )} />
                {isDiff ? 'Diff Key' : isRunning ? 'Running' : 'Stopped'}
              </span>
            </div>
            <p className="text-[12px] text-white/35 truncate">
              {project.description || project.defaultModel || 'No description'}
            </p>
          </div>
        </div>

        {/* Footer stats */}
        <div className="flex items-center gap-3 text-[11px] text-white/25 pt-3.5 border-t border-white/[0.05]">
          <div className="flex items-center gap-1.5">
            <Clock size={10} />
            <span>{project.lastOpenedAt ? formatRelative(project.lastOpenedAt) : 'Never opened'}</span>
          </div>
          {sessions !== null && (
            <div className="flex items-center gap-1.5">
              <MessageSquare size={10} />
              <span>{sessions} {sessions === 1 ? 'session' : 'sessions'}</span>
            </div>
          )}
          {snapshotLabel && (
            <div className="flex items-center gap-1.5 ml-auto text-[#30d158]/60">
              <Database size={10} />
              <span>{snapshotLabel}</span>
            </div>
          )}

          <span className={cn(
            'ml-auto text-[11px] font-semibold opacity-0 group-hover:opacity-100 transition-opacity',
            isDiff ? 'text-[#ff9f0a]' : 'text-[#0a84ff]'
          )}>
            {isDiff ? 'Migrate →' : opening ? '…' : 'Open →'}
          </span>
        </div>
      </div>

      {opening && (
        <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
          <Loader2 size={18} className="text-[#0a84ff] animate-spin" />
        </div>
      )}
    </div>
  )
}

export function DashboardPage() {
  const navigate = useNavigate()
  const { projects, load, loading } = useProjectsStore()
  const { apiKey, user, credits, initFromServer } = useAuthStore()
  const [showNew, setShowNew] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    initFromServer().catch(() => {})
    load().catch(() => {})
  }, [])

  const handleOpen = useCallback(async (project: Project) => {
    if (!apiKey) { navigate('/settings'); return }
    navigate(`/workspace/${project.id}`)
  }, [navigate, apiKey])

  const handleDelete = useCallback(async (id: string) => {
    try { await useProjectsStore.getState().deleteProject(id) } catch { /* ignore */ }
  }, [])

  const filtered = projects.filter(p =>
    !search ||
    p.name?.toLowerCase().includes(search.toLowerCase()) ||
    p.description?.toLowerCase().includes(search.toLowerCase())
  )

  const runningCount = projects.filter(p => p.sandbox?.status === 'running').length
  const diffKeyCount = projects.filter(p => p.differentKey).length
  const creditsCritical = credits && credits.balance <= 0
  const creditsLow = credits && credits.balance < 5

  const isEmpty = filtered.length === 0 && !search && !loading

  return (
    <div className="h-dvh flex flex-col bg-[#0a0a0a] overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-white/[0.06] bg-[#0a0a0a]/90 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-[#0a84ff] flex items-center justify-center shadow-[0_0_16px_rgba(10,132,255,0.35)]">
              <Zap size={14} className="text-white" strokeWidth={2.5} />
            </div>
            <span className="text-[14px] font-semibold text-white/90 tracking-tight">Vibecode Studio</span>
          </div>

          <div className="flex-1" />

          <div className="flex items-center gap-2">
            {!apiKey && (
              <button onClick={() => navigate('/settings')}
                className="flex items-center gap-1.5 h-7 px-3 rounded-lg bg-[#ff9f0a]/10 border border-[#ff9f0a]/20 text-[11px] font-semibold text-[#ff9f0a] hover:bg-[#ff9f0a]/15 transition-colors">
                <AlertCircle size={11} />
                Add API key
              </button>
            )}
            {credits && (
              <button onClick={() => navigate('/settings')}
                className={cn(
                  'flex items-center gap-1.5 h-7 px-2.5 rounded-lg border text-[11px] font-semibold tabular-nums transition-colors',
                  creditsCritical ? 'bg-[#ff453a]/10 border-[#ff453a]/20 text-[#ff453a]'
                  : creditsLow ? 'bg-[#ff9f0a]/10 border-[#ff9f0a]/20 text-[#ff9f0a]'
                  : 'border-white/[0.08] text-white/40 hover:text-white/70 hover:border-white/[0.14]'
                )}>
                <CreditCard size={11} />
                ${credits.balance.toFixed(2)}
              </button>
            )}
            <button onClick={() => navigate('/settings')}
              className="w-7 h-7 rounded-lg hover:bg-white/[0.06] text-white/35 hover:text-white/70 transition-colors flex items-center justify-center">
              <Settings size={14} />
            </button>
            {user && (
              <div className="w-7 h-7 rounded-lg bg-[#0a84ff] flex items-center justify-center text-[11px] font-bold text-white">
                {user.email?.[0]?.toUpperCase() ?? 'V'}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        {isEmpty ? (
          /* ── Empty state ── */
          <div className="relative flex flex-col items-center justify-center min-h-full px-6 py-16">
            <div className="absolute inset-0 bg-gradient-to-b from-[#0a84ff]/[0.04] via-transparent to-transparent pointer-events-none" />
            <div className="relative z-10 text-center max-w-lg">
              <div className="w-16 h-16 rounded-2xl bg-[#0a84ff]/10 border border-[#0a84ff]/20 flex items-center justify-center mx-auto mb-6">
                <Zap size={28} className="text-[#0a84ff]" strokeWidth={1.5} />
              </div>
              <h1 className="text-[28px] font-bold text-white tracking-tight mb-3">
                Build something great.
              </h1>
              <p className="text-[15px] text-white/40 leading-relaxed mb-10">
                Create your first Vibecode project to get started.
              </p>

              <button
                onClick={() => setShowNew(true)}
                className="inline-flex items-center gap-3 h-12 px-7 rounded-2xl bg-[#0a84ff] hover:bg-[#2a94ff] text-white text-[15px] font-semibold transition-all active:scale-95 shadow-[0_4px_16px_rgba(10,132,255,0.25)] mb-8"
              >
                <Plus size={18} strokeWidth={2.5} />
                New Project
              </button>

              <div className="flex flex-wrap justify-center gap-2">
                {QUICK_STARTERS.map(s => (
                  <button key={s.label} onClick={() => setShowNew(true)}
                    className="flex items-center gap-2 px-3.5 py-2 bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.07] hover:border-white/[0.12] rounded-full transition-all">
                    <s.icon size={13} className="text-white/35" />
                    <span className="text-[12px] text-white/55">{s.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* ── Projects view ── */
          <div className="max-w-5xl mx-auto px-6 py-8">
            {/* Toolbar */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-[20px] font-bold text-white tracking-tight">
                  {search ? `"${search}"` : 'Projects'}
                </h1>
                {!search && (
                  <p className="text-[13px] text-white/30 mt-0.5">
                    {projects.length} {projects.length === 1 ? 'project' : 'projects'}
                    {runningCount > 0 && <span className="text-[#30d158]"> · {runningCount} running</span>}
                    {diffKeyCount > 0 && <span className="text-[#ff9f0a]"> · {diffKeyCount} needs migration</span>}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20 pointer-events-none" />
                  <input
                    type="text" value={search} onChange={e => setSearch(e.target.value)}
                    placeholder="Search…"
                    className="h-9 w-44 pl-9 pr-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-[13px] text-white placeholder:text-white/20 focus:outline-none focus:border-[#0a84ff]/40 transition-all"
                  />
                </div>
                <button onClick={() => setShowNew(true)}
                  className="flex items-center gap-2 h-9 px-4 rounded-xl bg-[#0a84ff] hover:bg-[#2a94ff] text-white text-[13px] font-semibold transition-all active:scale-95 shadow-[0_2px_8px_rgba(10,132,255,0.2)]">
                  <Plus size={15} strokeWidth={2.5} />
                  New
                </button>
              </div>
            </div>

            {loading && (
              <div className="flex items-center justify-center py-20">
                <Loader2 size={22} className="text-white/15 animate-spin" />
              </div>
            )}

            {!loading && filtered.length === 0 && search && (
              <div className="flex flex-col items-center py-16 text-center">
                <Search size={28} className="text-white/10 mb-4" />
                <p className="text-[15px] text-white/30">No projects matching "{search}"</p>
              </div>
            )}

            {!loading && filtered.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filtered.map(p => (
                  <ProjectCard key={p.id} project={p} onOpen={handleOpen} onDelete={handleDelete} />
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      <NewProjectDialog open={showNew} onClose={() => setShowNew(false)} />
    </div>
  )
}
