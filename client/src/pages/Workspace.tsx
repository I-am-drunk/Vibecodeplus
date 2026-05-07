import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import {
  ChevronLeft, MessageSquare, Globe, Terminal as TerminalIcon,
  CloudUpload, History, X, AlertTriangle, Loader2, Zap, Bug, MoreVertical, Key
} from 'lucide-react'
import { useWorkspaceStore } from '../store/workspace'
import { useChatStore } from '../store/chat'
import { useProjectsStore } from '../store/projects'
import { useAuthStore } from '../store/auth'
import { useContinuationStore } from '../store/continuation'
import { useProjectEvents } from '../hooks/useProjectEvents'
import { useAutoSave } from '../hooks/useAutoSave'
import { useChat } from '../hooks/useChat'
import { api } from '../lib/api'
import { closeProjectWS } from '../lib/ws'
import { FileTree } from '../components/workspace/FileTree'
import { Editor } from '../components/workspace/Editor'
import { ChatPanel } from '../components/workspace/ChatPanel'
import { Preview } from '../components/workspace/Preview'
import { TerminalPanel } from '../components/workspace/Terminal'
import { ModelSelector } from '../components/workspace/ModelSelector'
import { CreditsBar } from '../components/CreditsBar'
import { BackupDialog } from '../components/dialogs/BackupDialog'
import { CreditsDialog } from '../components/dialogs/CreditsDialog'
import { KeyRecoveryDialog } from '../components/dialogs/KeyRecoveryDialog'
import { LogsDialog } from '../components/dialogs/LogsDialog'
import { ContinuationDialog } from '../components/dialogs/ContinuationDialog'
import { cn } from '../lib/utils'

function ResizeHandle({ onResize, direction = 'horizontal' }: {
  onResize: (delta: number) => void
  direction?: 'horizontal' | 'vertical'
}) {
  const dragging = useRef(false)
  const last = useRef(0)

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true
    last.current = direction === 'horizontal' ? e.clientX : e.clientY
    document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize'
    document.body.style.userSelect = 'none'

    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return
      const cur = direction === 'horizontal' ? ev.clientX : ev.clientY
      onResize(cur - last.current)
      last.current = cur
    }
    const onUp = () => {
      dragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  if (direction === 'horizontal') {
    return (
      <div onMouseDown={onMouseDown}
        className="flex-shrink-0 w-1 cursor-col-resize group relative"
        style={{ background: 'rgba(255,255,255,0.06)' }}>
        <div className="absolute inset-y-0 -left-1 -right-1 group-hover:bg-[#0a84ff] transition-colors opacity-0 group-hover:opacity-100" />
      </div>
    )
  }
  return (
    <div onMouseDown={onMouseDown}
      className="flex-shrink-0 h-1 cursor-row-resize group relative"
      style={{ background: 'rgba(255,255,255,0.06)' }}>
      <div className="absolute inset-x-0 -top-1 -bottom-1 group-hover:bg-[#0a84ff] transition-colors opacity-0 group-hover:opacity-100" />
    </div>
  )
}

export function WorkspacePage() {
  const { projectId } = useParams<{ projectId: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const resumeMode = searchParams.get('resume') === 'true'

  const { connected, setConnected, showPreview, showTerminal, togglePreview, toggleTerminal, reset, dirtyFiles, openFiles } = useWorkspaceStore()
  const { reset: resetChat } = useChatStore()
  const { projects, load: loadProjects } = useProjectsStore()
  const { credits } = useAuthStore()
  const { loadSession } = useChat(projectId ?? null)
  const continuationStore = useContinuationStore()

  const project = projects.find(p => p.id === projectId)

  const [showBackups, setShowBackups] = useState(false)
  const [showCredits, setShowCredits] = useState(false)
  const [showKeyRecovery, setShowKeyRecovery] = useState(false)
  const [keyRecoveryReason, setKeyRecoveryReason] = useState<'credits' | 'forbidden' | 'unauthorized'>('credits')
  const [showLogs, setShowLogs] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [sidebarVisible] = useState(true)
  const [chatVisible, setChatVisible] = useState(true)
  const [connecting, setConnecting] = useState(true)
  const [connectError, setConnectError] = useState<string | null>(null)
  const [resumeBanner, setResumeBanner] = useState(resumeMode)
  const [lastSession, setLastSession] = useState<any>(null)
  const [resuming, setResuming] = useState(false)

  const [sidebarW, setSidebarW] = useState(18)
  const [rightW, setRightW] = useState(40)
  const [termH, setTermH] = useState(240)
  const [previewH, setPreviewH] = useState(300)

  useProjectEvents(projectId ?? null)
  useAutoSave(projectId ?? null)

  useEffect(() => {
    if (!projectId) return
    setConnecting(true)
    continuationStore.reset()

    if (projects.length === 0) loadProjects().catch(() => {})

    api.openWorkspace(projectId)
      .then(async (res) => {
        // Different API key — activate continuation flow immediately
        if (res.differentKey) {
          continuationStore.setDifferentKey(true, res.snapshotAt)
          continuationStore.setShowDialog(true)
          setConnecting(false)
          return
        }
        setConnected(true)
        setConnecting(false)
        if (res.agentUrl) (window as any).__agentUrl = res.agentUrl

        if (resumeMode) {
          try {
            const { sessions } = await api.listSessions(projectId)
            if (sessions.length > 0) setLastSession(sessions[0])
            else setResumeBanner(false)
          } catch { setResumeBanner(false) }
        }
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : String(err)
        const msgLower = msg.toLowerCase()
        let reason: 'credits' | 'forbidden' | 'unauthorized' = 'credits'
        if (msgLower.includes('forbidden') || msg.includes('403')) reason = 'forbidden'
        else if (msgLower.includes('unauthorized') || msg.includes('401')) reason = 'unauthorized'

        if (msgLower.includes('credit') || msgLower.includes('forbidden') || msgLower.includes('unauthorized') ||
            msgLower.includes('rate limit') || msgLower.includes('too many') ||
            msg.includes('402') || msg.includes('403') || msg.includes('401') || msg.includes('429')) {
          setKeyRecoveryReason(reason)
          setShowKeyRecovery(true)
          setConnecting(false)
        } else {
          setConnectError(msg)
          setConnecting(false)
        }
      })

    return () => {
      reset(); resetChat()
      closeProjectWS(projectId)
      api.closeWorkspace(projectId)
      continuationStore.reset()
    }
  }, [projectId])

  const handleResume = async () => {
    if (!lastSession || !projectId) return
    setResuming(true)
    try { await loadSession(lastSession.id); setResumeBanner(false) }
    catch { /* ignore */ }
    finally { setResuming(false) }
  }

  const handleKeyRecovered = useCallback(() => {
    if (!projectId) return
    setShowKeyRecovery(false)
    setConnecting(true)
    setConnectError(null)
    api.openWorkspace(projectId)
      .then(async (res) => {
        if (res.differentKey) {
          continuationStore.setDifferentKey(true, res.snapshotAt)
          setConnecting(false)
          return
        }
        setConnected(true)
        setConnecting(false)
        if (res.agentUrl) (window as any).__agentUrl = res.agentUrl
      })
      .catch((err) => {
        setConnectError(err instanceof Error ? err.message : String(err))
        setConnecting(false)
      })
  }, [projectId])

  const handleContinuationSuccess = (newProjectId: string) => {
    continuationStore.reset()
    navigate(`/workspace/${newProjectId}`)
  }

  const rightVisible = openFiles.length > 0 || showTerminal || showPreview
  const creditsCritical = credits && credits.balance < 2
  const { differentKey, snapshotAt } = continuationStore

  if (connecting) {
    return (
      <div className="h-dvh bg-[#0a0a0a] flex flex-col items-center justify-center gap-3">
        <Loader2 size={22} className="text-[#0a84ff] animate-spin" />
        <p className="text-[13px] text-[rgba(235,235,245,0.35)]">Acquiring sandbox…</p>
      </div>
    )
  }

  if (connectError) {
    return (
      <div className="h-dvh bg-[#0a0a0a] flex flex-col items-center justify-center gap-4 px-6 text-center">
        <AlertTriangle size={28} className="text-[#ff453a]" />
        <p className="text-[14px] font-semibold text-white">Failed to connect</p>
        <p className="text-[13px] text-[rgba(235,235,245,0.4)] max-w-sm">{connectError}</p>
        <div className="flex gap-2 mt-1">
          <button onClick={() => navigate('/')}
            className="px-4 h-9 rounded-[10px] border border-[rgba(255,255,255,0.12)] text-[13px] text-white hover:bg-[rgba(255,255,255,0.06)] transition-colors">
            Go back
          </button>
          <button onClick={() => window.location.reload()}
            className="px-4 h-9 rounded-[10px] bg-[#0a84ff] text-white text-[13px] font-semibold hover:bg-[#409cff] transition-colors">
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-dvh flex flex-col bg-[#0a0a0a] overflow-hidden">
      {/* Header */}
      <header className="sticky top-0 z-50 flex items-center gap-3 px-4 h-14 border-b border-white/[0.06] flex-shrink-0 bg-[#0d0d0d]/80 backdrop-blur-xl">
        <button onClick={() => navigate('/')}
          className="flex items-center gap-1.5 h-8 px-3 rounded-lg hover:bg-white/[0.06] text-white/50 hover:text-white transition-colors flex-shrink-0">
          <ChevronLeft size={15} />
          <span className="text-[13px] font-medium hidden sm:inline">Back</span>
        </button>
        <div className="h-5 w-px bg-white/[0.06]" />
        <span className="text-[14px] font-semibold text-white truncate max-w-[200px]">
          {project?.name || projectId}
        </span>
        {differentKey && (
          <span className="flex items-center gap-1 bg-[#ff9f0a]/10 border border-[#ff9f0a]/20 rounded-full px-2.5 py-0.5 text-[10px] text-[#ff9f0a] font-medium flex-shrink-0">
            <Key size={9} /> Diff Key
          </span>
        )}
        {dirtyFiles.size > 0 && (
          <span className="text-[11px] text-[#ff9f0a] font-medium flex-shrink-0 bg-[#ff9f0a]/10 px-2 py-0.5 rounded-md">
            {dirtyFiles.size} unsaved
          </span>
        )}
        <div className="flex items-center gap-2 ml-auto">
          <ModelSelector />
          <CreditsBar />
          {creditsCritical && !differentKey && (
            <button onClick={() => setShowCredits(true)}
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12px] text-[#ff9f0a] font-medium hover:bg-[#ff9f0a]/10 transition-colors">
              Low credits
            </button>
          )}
          <div className="h-5 w-px bg-white/[0.06]" />
          <button onClick={() => setChatVisible(v => !v)}
            className={cn('flex items-center gap-2 h-8 px-3 rounded-lg transition-colors text-[13px] font-medium',
              chatVisible ? 'bg-[#0a84ff]/15 text-[#409cff]' : 'text-white/50 hover:bg-white/[0.06] hover:text-white')}>
            <MessageSquare size={16} />
            <span className="hidden lg:inline">Chat</span>
          </button>
          <button onClick={togglePreview}
            className={cn('flex items-center gap-2 h-8 px-3 rounded-lg transition-colors text-[13px] font-medium',
              showPreview ? 'bg-[#0a84ff]/15 text-[#409cff]' : 'text-white/50 hover:bg-white/[0.06] hover:text-white')}>
            <Globe size={16} />
            <span className="hidden lg:inline">Preview</span>
          </button>
          <button onClick={toggleTerminal}
            className={cn('flex items-center gap-2 h-8 px-3 rounded-lg transition-colors text-[13px] font-medium',
              showTerminal ? 'bg-[#0a84ff]/15 text-[#409cff]' : 'text-white/50 hover:bg-white/[0.06] hover:text-white')}>
            <TerminalIcon size={16} />
            <span className="hidden lg:inline">Terminal</span>
          </button>
          <div className="h-5 w-px bg-white/[0.06]" />
          <div className="relative">
            <button onClick={() => setShowMenu(v => !v)}
              className={cn('flex items-center justify-center h-8 w-8 rounded-lg transition-colors',
                showMenu ? 'bg-white/10 text-white' : 'text-white/50 hover:bg-white/[0.06] hover:text-white')}>
              <MoreVertical size={16} />
            </button>
            {showMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                <div className="absolute right-0 top-full mt-2 w-48 bg-[#1c1c1e] border border-white/10 rounded-xl shadow-2xl py-1.5 z-50">
                  <button onClick={() => { setShowBackups(true); setShowMenu(false) }}
                    className="w-full flex items-center gap-3 px-3 py-2 text-[13px] text-white/80 hover:bg-white/[0.06] transition-colors">
                    <CloudUpload size={15} /><span>Backups</span>
                  </button>
                  <button onClick={() => { setShowLogs(true); setShowMenu(false) }}
                    className="w-full flex items-center gap-3 px-3 py-2 text-[13px] text-white/80 hover:bg-white/[0.06] transition-colors">
                    <Bug size={15} /><span>Debug logs</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Different key banner */}
      {differentKey && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-[#ff9f0a]/[0.05] border-b border-[#ff9f0a]/15 flex-shrink-0">
          <Key size={13} className="text-[#ff9f0a] flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-[13px] text-[rgba(235,235,245,0.85)]">This project uses a different API key.</span>
            <span className="text-[12px] text-[rgba(235,235,245,0.35)] ml-2">Sending messages is paused.</span>
          </div>
          <button onClick={() => continuationStore.setShowDialog(true)}
            className="px-3 h-7 rounded-[8px] border border-[#ff9f0a]/30 text-[12px] text-[#ff9f0a] font-medium hover:bg-[#ff9f0a]/10 transition-colors flex items-center gap-1.5 flex-shrink-0">
            Migrate & Continue
          </button>
        </div>
      )}

      {/* Resume banner */}
      {resumeBanner && lastSession && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-[rgba(255,159,10,0.05)] border-b border-[rgba(255,159,10,0.15)] flex-shrink-0">
          <History size={13} className="text-[#ff9f0a] flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-[13px] text-[rgba(235,235,245,0.9)]">Previous session found</span>
            <span className="text-[12px] text-[rgba(235,235,245,0.4)] ml-2">
              {lastSession.messageCount ?? '?'} messages · Continue where you left off?
            </span>
          </div>
          <button onClick={handleResume} disabled={resuming}
            className="px-3 h-7 rounded-[8px] border border-[rgba(255,159,10,0.35)] text-[12px] text-[#ff9f0a] font-medium hover:bg-[rgba(255,159,10,0.08)] disabled:opacity-50 transition-colors flex items-center gap-1.5 flex-shrink-0">
            {resuming ? <Loader2 size={11} className="animate-spin" /> : <Zap size={11} />}
            {resuming ? 'Loading…' : 'Continue session'}
          </button>
          <button onClick={() => setResumeBanner(false)} className="text-[rgba(235,235,245,0.3)] hover:text-white transition-colors">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Main layout */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {sidebarVisible && (
          <>
            <div style={{ width: `${sidebarW}vw`, flexShrink: 0, minWidth: 200, maxWidth: '40vw' }}
              className="flex flex-col overflow-hidden border-r border-white/[0.06]">
              <FileTree projectId={projectId!} />
            </div>
            <ResizeHandle onResize={d => {
              const vw = window.innerWidth / 100
              setSidebarW(w => Math.max(200 / vw, Math.min(40, w + d / vw)))
            }} />
          </>
        )}

        {chatVisible && (
          <div className="flex-1 flex flex-col overflow-hidden" style={{ minWidth: 300 }}>
            <ChatPanel projectId={projectId!} disableInput={differentKey} />
          </div>
        )}

        {rightVisible && (
          <>
            <ResizeHandle onResize={d => {
              const vw = window.innerWidth / 100
              setRightW(w => Math.max(280 / vw, Math.min(60, w - d / vw)))
            }} />
            <div style={{ width: `${rightW}vw`, flexShrink: 0, minWidth: 280, maxWidth: '60vw' }}
              className="flex flex-col overflow-hidden border-l border-white/[0.06]">
              <div className="flex-1 overflow-hidden min-h-0">
                <Editor projectId={projectId!} />
              </div>
              {showPreview && (
                <>
                  <ResizeHandle direction="vertical" onResize={d => setPreviewH(h => Math.max(120, Math.min(window.innerHeight * 0.6, h - d)))} />
                  <div style={{ height: previewH, flexShrink: 0, maxHeight: '60vh' }} className="overflow-hidden">
                    <Preview projectId={projectId!} />
                  </div>
                </>
              )}
              {showTerminal && (
                <>
                  <ResizeHandle direction="vertical" onResize={d => setTermH(h => Math.max(100, Math.min(window.innerHeight * 0.5, h - d)))} />
                  <div style={{ height: termH, flexShrink: 0, maxHeight: '50vh' }} className="overflow-hidden">
                    <TerminalPanel projectId={projectId!} />
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>

      <BackupDialog open={showBackups} onClose={() => setShowBackups(false)} projectId={projectId!} />
      <CreditsDialog open={showCredits} onClose={() => setShowCredits(false)} />
      <KeyRecoveryDialog
        open={showKeyRecovery}
        onClose={() => setShowKeyRecovery(false)}
        onRecovered={handleKeyRecovered}
        projectId={projectId}
        reason={keyRecoveryReason}
      />
      <ContinuationDialog
        open={continuationStore.showDialog}
        projectId={projectId!}
        projectName={project?.name || projectId!}
        snapshotAt={snapshotAt}
        onSuccess={handleContinuationSuccess}
        onClose={() => continuationStore.setShowDialog(false)}
      />
      {showLogs && <LogsDialog onClose={() => setShowLogs(false)} />}
    </div>
  )
}
