import { useEffect, useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Settings, Search, Loader2, CreditCard, AlertCircle, Zap,
  Clock, Trash2, MessageSquare, FolderOpen, Key, Database, Globe,
  Bot, Palette, FileSearch, AppWindow, CheckCircle, RefreshCw,
  LayoutGrid, List, PlayCircle, HardDrive
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
  viewMode: 'grid' | 'list'
}

function ProjectCard({ project, onOpen, onDelete, viewMode }: ProjectCardProps) {
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

  if (viewMode === 'list') {
    return (
      <div
        className={cn(
          'group relative flex items-center gap-4 p-4 rounded-xl border transition-all duration-200 cursor-pointer overflow-hidden',
          isRunning && !isDiff ? 'border-[#30d158]/30 bg-[#30d158]/[0.02] hover:bg-[#30d158]/[0.05]' :
          isDiff ? 'border-[#ff9f0a]/30 bg-[#ff9f0a]/[0.02] hover:bg-[#ff9f0a]/[0.05]' :
          'border-white/[0.08] bg-white/[0.01] hover:bg-white/[0.03] hover:border-white/[0.15]',
          (opening || deleting) && 'opacity-50 pointer-events-none'
        )}
        onClick={handleOpen}
      >
        <div className={cn(
          'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 transition-all',
          isRunning && !isDiff ? 'bg-[#30d158]/15 text-[#30d158]' :
          isDiff ? 'bg-[#ff9f0a]/15 text-[#ff9f0a]' :
          'bg-white/[0.05] text-white/40'
        )}>
          {isRunning && !isDiff ? <PlayCircle size={18} /> : isDiff ? <Key size={18} /> : <FolderOpen size={18} />}
        </div>
        
        <div className="flex-1 min-w-0 flex flex-col justify-center">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-[14px] font-semibold text-white truncate">{project.name || 'Unnamed Project'}</h3>
            {isDiff && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-[#ff9f0a]/15 text-[#ff9f0a]">Diff Key</span>}
            {isRunning && !isDiff && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-[#30d158]/15 text-[#30d158]">Running</span>}
          </div>
          <p className="text-[13px] text-white/40 truncate">{project.description || project.defaultModel || 'No description'}</p>
        </div>

        <div className="flex items-center gap-6 text-[12px] text-white/30 hidden md:flex">
          <div className="flex items-center gap-1.5 w-32"><Clock size={12} className="text-white/20"/>{project.lastOpenedAt ? formatRelative(project.lastOpenedAt) : 'Never opened'}</div>
          <div className="flex items-center gap-1.5 w-24">{sessions !== null ? <><MessageSquare size={12} className="text-white/20"/>{sessions} sessions</> : null}</div>
          <div className="flex items-center gap-1.5 w-40">{snapshotLabel ? <><Database size={12} className="text-[#30d158]/60"/><span className="text-[#30d158]/60 truncate">{snapshotLabel}</span></> : null}</div>
        </div>

        <div className="flex items-center gap-2 pl-4">
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="w-8 h-8 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-[#ff453a]/15 hover:text-[#ff453a] text-white/30 transition-all"
          >
            {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
          </button>
          <div className={cn(
            'px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all',
            isDiff ? 'bg-[#ff9f0a]/10 text-[#ff9f0a]' : 'bg-[#0a84ff]/10 text-[#0a84ff] opacity-0 group-hover:opacity-100'
          )}>
            {isDiff ? 'Migrate' : opening ? 'Opening...' : 'Open'}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'group relative rounded-2xl border transition-all duration-300 cursor-pointer overflow-hidden flex flex-col',
        isRunning && !isDiff ? 'border-[#30d158]/25 bg-gradient-to-b from-[#30d158]/[0.05] to-transparent hover:border-[#30d158]/40 hover:shadow-[0_8px_32px_rgba(48,209,88,0.1)]' :
        isDiff ? 'border-[#ff9f0a]/25 bg-gradient-to-b from-[#ff9f0a]/[0.05] to-transparent hover:border-[#ff9f0a]/40 hover:shadow-[0_8px_32px_rgba(255,159,10,0.1)]' :
        'border-white/[0.08] bg-[#111113] hover:bg-[#161618] hover:border-white/[0.15]',
        (opening || deleting) && 'opacity-50 pointer-events-none'
      )}
      onClick={handleOpen}
    >
      {/* Top Banner for diff key */}
      {isDiff && (
        <div className="absolute top-0 inset-x-0 flex items-center justify-center gap-1.5 py-1.5 bg-[#ff9f0a]/20 border-b border-[#ff9f0a]/30">
          <Key size={10} className="text-[#ff9f0a]" />
          <span className="text-[10px] font-bold text-[#ff9f0a] uppercase tracking-wider">Migration Required</span>
        </div>
      )}

      {/* Delete button */}
      <button
        onClick={handleDelete}
        disabled={deleting}
        className={cn(
          "absolute top-3 right-3 z-10 w-8 h-8 rounded-lg bg-black/60 backdrop-blur-md border border-white/[0.08] flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-[#ff453a]/20 hover:border-[#ff453a]/30 hover:text-[#ff453a] text-white/40 transition-all",
          isDiff && "top-8"
        )}
      >
        {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
      </button>

      <div className={cn("p-5 flex-1 flex flex-col", isDiff && "pt-8")}>
        <div className="flex items-start gap-4 mb-4">
          <div className={cn(
            'w-12 h-12 rounded-[14px] flex items-center justify-center flex-shrink-0 shadow-inner',
            isRunning && !isDiff ? 'bg-[#30d158]/20 text-[#30d158]' :
            isDiff ? 'bg-[#ff9f0a]/20 text-[#ff9f0a]' :
            'bg-white/[0.04] text-white/50 border border-white/[0.05]'
          )}>
            {isRunning && !isDiff ? <PlayCircle size={22} strokeWidth={2} /> : isDiff ? <Key size={22} /> : <FolderOpen size={22} strokeWidth={1.5} />}
          </div>
          <div className="flex-1 min-w-0 mt-0.5">
            <h3 className="text-[16px] font-semibold text-white/95 truncate tracking-tight">{project.name || 'Unnamed Project'}</h3>
            <div className="flex items-center gap-2 mt-1">
              {isRunning && !isDiff && (
                <span className="flex items-center gap-1.5 text-[11px] font-medium text-[#30d158]">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#30d158] opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-[#30d158]"></span>
                  </span>
                  Active Sandbox
                </span>
              )}
              {(!isRunning && !isDiff) && (
                <span className="text-[11px] text-white/30 font-medium">Sleeping</span>
              )}
            </div>
          </div>
        </div>

        <p className="text-[13px] text-white/40 leading-relaxed line-clamp-2 mb-4 flex-1">
          {project.description || project.defaultModel || 'No description provided.'}
        </p>

        <div className="flex flex-col gap-2.5 mt-auto pt-4 border-t border-white/[0.06]">
          <div className="flex items-center justify-between text-[11px] text-white/30 font-medium">
            <div className="flex items-center gap-1.5"><Clock size={12} className="text-white/20"/> {project.lastOpenedAt ? formatRelative(project.lastOpenedAt) : 'Never'}</div>
            {sessions !== null && <div className="flex items-center gap-1.5"><MessageSquare size={12} className="text-white/20"/> {sessions}</div>}
          </div>
          {snapshotLabel && (
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-[#30d158]/70 bg-[#30d158]/5 px-2 py-1.5 rounded-md border border-[#30d158]/10 w-fit">
              <Database size={11} /> {snapshotLabel}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

type FilterState = 'all' | 'running' | 'diff'

export function DashboardPage() {
  const navigate = useNavigate()
  const { projects, load, loading } = useProjectsStore()
  const { apiKey, user, credits, initFromServer } = useAuthStore()
  const [showNew, setShowNew] = useState(false)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterState>('all')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')

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

  const runningCount = projects.filter(p => p.sandbox?.status === 'running').length
  const diffKeyCount = projects.filter(p => p.differentKey).length

  const filtered = useMemo(() => {
    return projects.filter(p => {
      const s = search.toLowerCase()
      const matchesSearch = !search || 
        p.name?.toLowerCase().includes(s) || 
        p.description?.toLowerCase().includes(s)
      
      if (!matchesSearch) return false
      
      if (filter === 'running') return p.sandbox?.status === 'running' && !p.differentKey
      if (filter === 'diff') return p.differentKey
      return true
    }).sort((a, b) => {
      const aTime = a.lastOpenedAt ? new Date(a.lastOpenedAt).getTime() : 0
      const bTime = b.lastOpenedAt ? new Date(b.lastOpenedAt).getTime() : 0
      return bTime - aTime
    })
  }, [projects, search, filter])

  const creditsCritical = credits && credits.balance <= 0
  const creditsLow = credits && credits.balance < 5

  const isEmptyState = projects.length === 0 && !loading

  return (
    <div className="h-dvh flex flex-col bg-[#050505] text-white overflow-hidden font-sans selection:bg-[#0a84ff]/30">
      {/* Sleek Header */}
      <header className="flex-shrink-0 border-b border-white/[0.04] bg-[#050505]/80 backdrop-blur-2xl z-20">
        <div className="max-w-[1400px] mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-default">
            <div className="w-8 h-8 rounded-[10px] bg-gradient-to-tr from-[#0a84ff] to-[#409cff] flex items-center justify-center shadow-[0_0_20px_rgba(10,132,255,0.4)]">
              <Zap size={16} className="text-white fill-white/20" strokeWidth={2} />
            </div>
            <span className="text-[15px] font-bold text-white/95 tracking-wide">Vibecode Studio</span>
          </div>

          <div className="flex items-center gap-3">
            {!apiKey && (
              <button onClick={() => navigate('/settings')}
                className="flex items-center gap-1.5 h-8 px-3.5 rounded-full bg-[#ff9f0a]/10 border border-[#ff9f0a]/20 text-[12px] font-bold text-[#ff9f0a] hover:bg-[#ff9f0a]/20 transition-all shadow-[0_0_15px_rgba(255,159,10,0.1)]">
                <AlertCircle size={13} strokeWidth={2.5} />
                Missing API Key
              </button>
            )}
            {credits && (
              <button onClick={() => navigate('/settings')}
                className={cn(
                  'flex items-center gap-1.5 h-8 px-3.5 rounded-full border text-[12px] font-bold tabular-nums transition-all',
                  creditsCritical ? 'bg-[#ff453a]/10 border-[#ff453a]/30 text-[#ff453a] shadow-[0_0_15px_rgba(255,69,58,0.15)]'
                  : creditsLow ? 'bg-[#ff9f0a]/10 border-[#ff9f0a]/30 text-[#ff9f0a] shadow-[0_0_15px_rgba(255,159,10,0.15)]'
                  : 'bg-white/[0.03] border-white/[0.08] text-white/60 hover:text-white hover:bg-white/[0.08]'
                )}>
                <CreditCard size={13} strokeWidth={2} />
                ${credits.balance.toFixed(2)}
              </button>
            )}
            <button onClick={() => navigate('/settings')}
              className="w-8 h-8 rounded-full hover:bg-white/[0.08] text-white/40 hover:text-white transition-all flex items-center justify-center border border-transparent hover:border-white/[0.05]">
              <Settings size={15} strokeWidth={2} />
            </button>
            {user && (
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#30d158] to-[#40d158] flex items-center justify-center text-[12px] font-bold text-black shadow-[0_0_15px_rgba(48,209,88,0.2)] ml-1">
                {user.email?.[0]?.toUpperCase() ?? 'V'}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto custom-scrollbar relative">
        <div className="absolute top-0 left-0 w-full h-[500px] bg-gradient-to-b from-[#0a84ff]/[0.03] to-transparent pointer-events-none" />
        
        {isEmptyState ? (
          /* Empty State */
          <div className="relative flex flex-col items-center justify-center min-h-[80vh] px-6 py-20 animate-fade-in">
            <div className="text-center max-w-2xl mx-auto flex flex-col items-center">
              <div className="relative mb-8">
                <div className="absolute inset-0 bg-[#0a84ff] blur-[60px] opacity-20 rounded-full" />
                <div className="w-24 h-24 rounded-[32px] bg-gradient-to-br from-[#111113] to-[#050505] border border-white/[0.1] shadow-2xl flex items-center justify-center relative z-10">
                  <HardDrive size={40} className="text-[#0a84ff]/80" strokeWidth={1.5} />
                </div>
              </div>
              
              <h1 className="text-[36px] font-extrabold text-white tracking-tight mb-4">
                Your Workspace Awaits
              </h1>
              <p className="text-[16px] text-white/40 leading-relaxed mb-12 max-w-md">
                Create your first project to spin up a secure, instant sandbox environment powered by Vibecode AI.
              </p>

              <button
                onClick={() => setShowNew(true)}
                className="inline-flex items-center gap-3 h-14 px-8 rounded-full bg-white text-black text-[16px] font-bold transition-all hover:scale-[1.02] active:scale-[0.98] shadow-[0_0_30px_rgba(255,255,255,0.15)] mb-14"
              >
                <Plus size={20} strokeWidth={3} />
                Create New Project
              </button>

              <div className="w-full text-left">
                <p className="text-[12px] font-bold text-white/20 uppercase tracking-widest mb-4 ml-2">Quick Starters</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {QUICK_STARTERS.map(s => (
                    <button key={s.label} onClick={() => setShowNew(true)}
                      className="group flex flex-col items-start gap-2 p-4 bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.04] hover:border-white/[0.1] rounded-2xl transition-all text-left">
                      <div className="w-8 h-8 rounded-lg bg-white/[0.05] flex items-center justify-center group-hover:scale-110 transition-transform">
                        <s.icon size={16} className="text-[#0a84ff]" />
                      </div>
                      <div>
                        <span className="block text-[14px] font-semibold text-white/80 group-hover:text-white">{s.label}</span>
                        <span className="block text-[12px] text-white/30 group-hover:text-white/50">{s.value}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Projects Dashboard */
          <div className="max-w-[1400px] mx-auto px-6 py-10">
            {/* Header & Stats */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
              <div>
                <h1 className="text-[32px] font-extrabold tracking-tight mb-2">Projects</h1>
                <p className="text-[14px] text-white/40 flex items-center gap-2">
                  <span>{projects.length} Total</span>
                  {runningCount > 0 && <><span className="w-1 h-1 rounded-full bg-white/20" /><span className="text-[#30d158] font-medium">{runningCount} Running</span></>}
                  {diffKeyCount > 0 && <><span className="w-1 h-1 rounded-full bg-white/20" /><span className="text-[#ff9f0a] font-medium">{diffKeyCount} Needs Migration</span></>}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => setShowNew(true)}
                  className="flex items-center gap-2 h-11 px-5 rounded-full bg-white hover:bg-white/90 text-black text-[14px] font-bold transition-all shadow-[0_0_20px_rgba(255,255,255,0.1)] active:scale-95">
                  <Plus size={18} strokeWidth={2.5} />
                  New Project
                </button>
              </div>
            </div>

            {/* Filters & Controls */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 bg-[#111113]/50 p-2 rounded-2xl border border-white/[0.04]">
              <div className="flex items-center gap-1 p-1 bg-black/40 rounded-xl border border-white/[0.04] overflow-x-auto custom-scrollbar">
                <button 
                  onClick={() => setFilter('all')}
                  className={cn("px-4 py-2 rounded-lg text-[13px] font-bold transition-all whitespace-nowrap", filter === 'all' ? "bg-white/[0.1] text-white shadow-sm" : "text-white/40 hover:text-white/70")}
                >
                  All Projects
                </button>
                <button 
                  onClick={() => setFilter('running')}
                  className={cn("px-4 py-2 rounded-lg text-[13px] font-bold transition-all whitespace-nowrap flex items-center gap-2", filter === 'running' ? "bg-[#30d158]/15 text-[#30d158] shadow-sm" : "text-white/40 hover:text-white/70")}
                >
                  <PlayCircle size={14} /> Active
                  {runningCount > 0 && <span className="bg-[#30d158]/20 px-1.5 py-0.5 rounded text-[10px]">{runningCount}</span>}
                </button>
                <button 
                  onClick={() => setFilter('diff')}
                  className={cn("px-4 py-2 rounded-lg text-[13px] font-bold transition-all whitespace-nowrap flex items-center gap-2", filter === 'diff' ? "bg-[#ff9f0a]/15 text-[#ff9f0a] shadow-sm" : "text-white/40 hover:text-white/70")}
                >
                  <Key size={14} /> Migration
                  {diffKeyCount > 0 && <span className="bg-[#ff9f0a]/20 px-1.5 py-0.5 rounded text-[10px]">{diffKeyCount}</span>}
                </button>
              </div>

              <div className="flex items-center gap-3 px-2">
                <div className="relative group">
                  <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30 group-focus-within:text-[#0a84ff] transition-colors pointer-events-none" />
                  <input
                    type="text" value={search} onChange={e => setSearch(e.target.value)}
                    placeholder="Search projects..."
                    className="h-10 w-full sm:w-64 pl-10 pr-4 bg-black/40 border border-white/[0.08] rounded-xl text-[13px] font-medium text-white placeholder:text-white/30 focus:outline-none focus:border-[#0a84ff]/50 focus:ring-1 focus:ring-[#0a84ff]/50 transition-all shadow-inner"
                  />
                  {search && (
                    <button onClick={() => setSearch('')} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/30 hover:text-white">
                      ✕
                    </button>
                  )}
                </div>
                
                <div className="hidden sm:flex items-center bg-black/40 p-1 rounded-xl border border-white/[0.08]">
                  <button onClick={() => setViewMode('grid')} className={cn("p-1.5 rounded-lg transition-colors", viewMode === 'grid' ? "bg-white/[0.1] text-white" : "text-white/30 hover:text-white/60")}>
                    <LayoutGrid size={16} />
                  </button>
                  <button onClick={() => setViewMode('list')} className={cn("p-1.5 rounded-lg transition-colors", viewMode === 'list' ? "bg-white/[0.1] text-white" : "text-white/30 hover:text-white/60")}>
                    <List size={16} />
                  </button>
                </div>
              </div>
            </div>

            {loading && (
              <div className="flex flex-col items-center justify-center py-32 gap-4">
                <Loader2 size={32} className="text-[#0a84ff] animate-spin" />
                <span className="text-[14px] font-medium text-white/40">Loading workspace...</span>
              </div>
            )}

            {!loading && filtered.length === 0 && (
              <div className="flex flex-col items-center justify-center py-32 text-center border border-dashed border-white/[0.05] rounded-3xl bg-white/[0.01]">
                <div className="w-16 h-16 rounded-2xl bg-white/[0.03] flex items-center justify-center mb-4">
                  <Search size={24} className="text-white/20" />
                </div>
                <h3 className="text-[18px] font-bold text-white/80 mb-2">No projects found</h3>
                <p className="text-[14px] text-white/40 max-w-sm">
                  {search ? `We couldn't find anything matching "${search}". Try adjusting your search or filters.` : "There are no projects matching your current filters."}
                </p>
                {(search || filter !== 'all') && (
                  <button onClick={() => { setSearch(''); setFilter('all') }} className="mt-6 text-[13px] font-bold text-[#0a84ff] hover:text-[#409cff] transition-colors">
                    Clear all filters
                  </button>
                )}
              </div>
            )}

            {!loading && filtered.length > 0 && (
              <div className={cn(
                "grid gap-4",
                viewMode === 'grid' ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" : "grid-cols-1"
              )}>
                {filtered.map(p => (
                  <ProjectCard key={p.id} project={p} onOpen={handleOpen} onDelete={handleDelete} viewMode={viewMode} />
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
