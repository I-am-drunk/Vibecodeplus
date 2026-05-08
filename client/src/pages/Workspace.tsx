import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import {
  ChevronLeft,
  MessageSquare,
  Globe,
  Terminal as TerminalIcon,
  CloudUpload,
  History,
  X,
  AlertTriangle,
  Loader2,
  Zap,
  Bug,
  MoreVertical,
  Key,
} from 'lucide-react'
import { useWorkspaceStore } from '../store/workspace'
import { useChatStore } from '../store/chat'
import { useProjectsStore } from '../store/projects'

import { useContinuationStore } from '../store/continuation'
import { useProjectEvents } from '../hooks/useProjectEvents'
import { useAutoSave } from '../hooks/useAutoSave'
import { useChat } from '../hooks/useChat'
import { api } from '../lib/api'
import { APIError } from '../lib/api'
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

function ResizeHandle({
  onResize,
  direction = 'horizontal',
  onDragStart,
  onDragEnd,
}: {
  onResize: (delta: number) => void
  direction?: 'horizontal' | 'vertical'
  onDragStart?: () => void
  onDragEnd?: () => void
}) {
  const dragging = useRef(false)
  const last = useRef(0)

  const onMouseDown = (event: React.MouseEvent) => {
    event.preventDefault()
    dragging.current = true
    last.current = direction === 'horizontal' ? event.clientX : event.clientY
    document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize'
    document.body.style.userSelect = 'none'
    onDragStart?.()

    const onMove = (moveEvent: MouseEvent) => {
      if (!dragging.current) return
      const current = direction === 'horizontal' ? moveEvent.clientX : moveEvent.clientY
      onResize(current - last.current)
      last.current = current
    }

    const onUp = () => {
      dragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      onDragEnd?.()
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  if (direction === 'horizontal') {
    return (
      <div
        onMouseDown={onMouseDown}
        className="flex-shrink-0 w-1 cursor-col-resize group relative hover:bg-[#0a84ff]/40 transition-colors"
        style={{ background: 'rgba(255,255,255,0.06)' }}
      >
        <div className="absolute inset-y-0 -left-1 -right-1" />
      </div>
    )
  }

  return (
    <div
      onMouseDown={onMouseDown}
      className="flex-shrink-0 h-1 cursor-row-resize group relative hover:bg-[#0a84ff]/40 transition-colors"
      style={{ background: 'rgba(255,255,255,0.06)' }}
    >
      <div className="absolute inset-x-0 -top-1 -bottom-1" />
    </div>
  )
}

export function WorkspacePage() {
  const { projectId } = useParams<{ projectId: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const resumeMode = searchParams.get('resume') === 'true'

  const { setConnected, reset, dirtyFiles, openFiles, showPreview, showTerminal, togglePreview, toggleTerminal } = useWorkspaceStore()
  const { reset: resetChat } = useChatStore()
  const { projects, load: loadProjects } = useProjectsStore()
  const { loadSession } = useChat(projectId ?? null)
  const continuationStore = useContinuationStore()

  const project = projects.find((entry) => entry.id === projectId)

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

  const [sidebarW, setSidebarW] = useState(220)
  const [rightW, setRightW] = useState(480)
  const [termH, setTermH] = useState(240)
  const [previewH, setPreviewH] = useState(300)
  const [dragging, setDragging] = useState(false)

  const activeWorkspaceIdRef = useRef<string | null>(null)

  useProjectEvents(projectId ?? null)
  useAutoSave(projectId ?? null)

  const checkContinuationState = useCallback(
    async (requestedProjectId: string) => {
      continuationStore.setCheckingStatus(true)
      try {
        const status = await api.continuationStatus(requestedProjectId)

        continuationStore.setDifferentKey(status.needsContinuation, status.snapshotAt)
        continuationStore.setMigrationState({
          migrationId: status.migration?.id ?? null,
          migrationStage: status.migration?.stage ?? null,
          migrationStatus: status.migration?.status ?? null,
          migrationMessage: status.migration?.stageMessage || status.migration?.warning || '',
          migrationTargetProjectId: status.migration?.targetProjectId ?? null,
          sourcePreserved: status.migration?.sourcePreserved ?? true,
        })

        if (status.canonicalProjectId && status.canonicalProjectId !== requestedProjectId) {
          navigate(`/workspace/${status.canonicalProjectId}`, { replace: true })
          return status.canonicalProjectId
        }

        return requestedProjectId
      } finally {
        continuationStore.setCheckingStatus(false)
      }
    },
    [continuationStore, navigate],
  )

  const openWorkspace = useCallback(
    async (requestedProjectId: string) => {
      setConnecting(true)
      setConnectError(null)

      const resolvedProjectId = await checkContinuationState(requestedProjectId)
      if (!resolvedProjectId) {
        setConnecting(false)
        return
      }

      const response = await api.openWorkspace(resolvedProjectId)
      const canonicalProjectId = response.canonicalProjectId || resolvedProjectId
      activeWorkspaceIdRef.current = canonicalProjectId

      if (canonicalProjectId !== requestedProjectId) {
        navigate(`/workspace/${canonicalProjectId}`, { replace: true })
      }

      if (response.differentKey) {
        continuationStore.setDifferentKey(true, response.snapshotAt)
        continuationStore.setShowDialog(true)
        setConnected(false)
        setConnecting(false)
        return
      }

      setConnected(true)
      if (response.agentUrl) {
        ;(window as any).__agentUrl = response.agentUrl
      }

      if (resumeMode) {
        try {
          const { sessions } = await api.listSessions(canonicalProjectId)
          if (sessions.length > 0) {
            setLastSession(sessions[0])
          } else {
            setResumeBanner(false)
          }
        } catch {
          setResumeBanner(false)
        }
      }

      setConnecting(false)
    },
    [checkContinuationState, continuationStore, navigate, resumeMode, setConnected],
  )

  useEffect(() => {
    if (!projectId) return

    continuationStore.reset()

    if (projects.length === 0) {
      void loadProjects().catch(() => {})
    }

    void openWorkspace(projectId).catch((error) => {
      const message = error instanceof Error ? error.message : String(error)
      const lower = message.toLowerCase()

      let reason: 'credits' | 'forbidden' | 'unauthorized' = 'credits'
      if (error instanceof APIError) {
        if (error.status === 403 || lower.includes('forbidden')) reason = 'forbidden'
        if (error.status === 401 || lower.includes('unauthorized')) reason = 'unauthorized'
      } else {
        if (lower.includes('forbidden')) reason = 'forbidden'
        if (lower.includes('unauthorized')) reason = 'unauthorized'
      }

      const shouldShowRecovery =
        lower.includes('credit') ||
        lower.includes('forbidden') ||
        lower.includes('unauthorized') ||
        message.includes('402') ||
        message.includes('403') ||
        message.includes('401')

      if (shouldShowRecovery) {
        setKeyRecoveryReason(reason)
        setShowKeyRecovery(true)
        setConnecting(false)
        return
      }

      setConnectError(message)
      setConnecting(false)
    })

    return () => {
      reset()
      resetChat()
      const activeWorkspaceId = activeWorkspaceIdRef.current
      if (activeWorkspaceId) {
        closeProjectWS(activeWorkspaceId)
        void api.closeWorkspace(activeWorkspaceId)
      }
      activeWorkspaceIdRef.current = null
      continuationStore.reset()
    }
  }, [continuationStore, loadProjects, openWorkspace, projectId, projects.length, reset, resetChat])

  const handleResume = async () => {
    if (!lastSession || !projectId) return
    setResuming(true)
    try {
      await loadSession(lastSession.id)
      setResumeBanner(false)
    } finally {
      setResuming(false)
    }
  }

  const handleKeyRecovered = useCallback(() => {
    if (!projectId) return
    setShowKeyRecovery(false)
    void openWorkspace(projectId).catch((error) => {
      setConnectError(error instanceof Error ? error.message : String(error))
      setConnecting(false)
    })
  }, [openWorkspace, projectId])

  const handleContinuationSuccess = (newProjectId: string) => {
    continuationStore.reset()
    navigate(`/workspace/${newProjectId}`)
  }

  const rightVisible = openFiles.length > 0 || showTerminal || showPreview
  const { differentKey, snapshotAt, migrationStatus, migrationStage } = continuationStore

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
          <button
            onClick={() => navigate('/')}
            className="px-4 h-9 rounded-[10px] border border-[rgba(255,255,255,0.12)] text-[13px] text-white hover:bg-[rgba(255,255,255,0.06)] transition-colors"
          >
            Go back
          </button>
          <button
            onClick={() => {
              if (projectId) {
                void openWorkspace(projectId).catch((error) => {
                  setConnectError(error instanceof Error ? error.message : String(error))
                })
              }
            }}
            className="px-4 h-9 rounded-[10px] bg-[#0a84ff] text-white text-[13px] font-semibold hover:bg-[#409cff] transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-dvh flex flex-col bg-[#0a0a0a] overflow-hidden">
      <header className="sticky top-0 z-50 flex items-center gap-3 px-4 h-14 border-b border-white/[0.06] flex-shrink-0 bg-[#0d0d0d]/80 backdrop-blur-xl">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-1.5 h-8 px-3 rounded-lg hover:bg-white/[0.06] text-white/50 hover:text-white transition-colors flex-shrink-0"
        >
          <ChevronLeft size={15} />
          <span className="text-[13px] font-medium hidden sm:inline">Back</span>
        </button>
        <div className="h-5 w-px bg-white/[0.06]" />
        <span className="text-[14px] font-semibold text-white truncate max-w-[200px]">{project?.name || projectId}</span>
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
          <CreditsBar onClick={() => setShowCredits(true)} />
          <div className="h-5 w-px bg-white/[0.06]" />
          <button
            onClick={() => setChatVisible((value) => !value)}
            className={cn(
              'flex items-center gap-2 h-8 px-3 rounded-lg transition-colors text-[13px] font-medium',
              chatVisible ? 'bg-[#0a84ff]/15 text-[#409cff]' : 'text-white/50 hover:bg-white/[0.06] hover:text-white',
            )}
          >
            <MessageSquare size={16} />
            <span className="hidden lg:inline">Chat</span>
          </button>
          <button
            onClick={togglePreview}
            className={cn(
              'flex items-center gap-2 h-8 px-3 rounded-lg transition-colors text-[13px] font-medium',
              showPreview ? 'bg-[#0a84ff]/15 text-[#409cff]' : 'text-white/50 hover:bg-white/[0.06] hover:text-white',
            )}
          >
            <Globe size={16} />
            <span className="hidden lg:inline">Preview</span>
          </button>
          <button
            onClick={toggleTerminal}
            className={cn(
              'flex items-center gap-2 h-8 px-3 rounded-lg transition-colors text-[13px] font-medium',
              showTerminal ? 'bg-[#0a84ff]/15 text-[#409cff]' : 'text-white/50 hover:bg-white/[0.06] hover:text-white',
            )}
          >
            <TerminalIcon size={16} />
            <span className="hidden lg:inline">Terminal</span>
          </button>
          <div className="h-5 w-px bg-white/[0.06]" />
          <div className="relative">
            <button
              onClick={() => setShowMenu((value) => !value)}
              className={cn(
                'flex items-center justify-center h-8 w-8 rounded-lg transition-colors',
                showMenu ? 'bg-white/10 text-white' : 'text-white/50 hover:bg-white/[0.06] hover:text-white',
              )}
            >
              <MoreVertical size={16} />
            </button>
            {showMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                <div className="absolute right-0 top-full mt-2 w-48 bg-[#1c1c1e] border border-white/10 rounded-xl shadow-2xl py-1.5 z-50">
                  <button
                    onClick={() => {
                      setShowBackups(true)
                      setShowMenu(false)
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2 text-[13px] text-white/80 hover:bg-white/[0.06] transition-colors"
                  >
                    <CloudUpload size={15} />
                    <span>Backups</span>
                  </button>
                  <button
                    onClick={() => {
                      setShowLogs(true)
                      setShowMenu(false)
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2 text-[13px] text-white/80 hover:bg-white/[0.06] transition-colors"
                  >
                    <Bug size={15} />
                    <span>Debug logs</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {differentKey && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-[#ff9f0a]/[0.05] border-b border-[#ff9f0a]/15 flex-shrink-0">
          <Key size={13} className="text-[#ff9f0a] flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-[13px] text-[rgba(235,235,245,0.85)]">This project uses a different API key.</span>
            <span className="text-[12px] text-[rgba(235,235,245,0.35)] ml-2">Sending messages is paused.</span>
          </div>
          <button
            onClick={() => continuationStore.setShowDialog(true)}
            className="px-3 h-7 rounded-[8px] border border-[#ff9f0a]/30 text-[12px] text-[#ff9f0a] font-medium hover:bg-[#ff9f0a]/10 transition-colors flex items-center gap-1.5 flex-shrink-0"
          >
            Migrate & Continue
          </button>
        </div>
      )}

      {migrationStatus && migrationStatus !== 'completed' && migrationStatus !== 'failed' && migrationStatus !== 'partial_failed' && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-[#0a84ff]/20 bg-[#0a84ff]/[0.08]">
          <Loader2 size={12} className="text-[#0a84ff] animate-spin" />
          <span className="text-[12px] text-[#409cff]">
            Migration in progress{migrationStage ? ` · ${migrationStage.replaceAll('_', ' ')}` : ''}
          </span>
        </div>
      )}

      {resumeBanner && lastSession && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-[rgba(255,159,10,0.05)] border-b border-[rgba(255,159,10,0.15)] flex-shrink-0">
          <History size={13} className="text-[#ff9f0a] flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-[13px] text-[rgba(235,235,245,0.9)]">Previous session found</span>
            <span className="text-[12px] text-[rgba(235,235,245,0.4)] ml-2">
              {lastSession.messageCount ?? '?'} messages · Continue where you left off?
            </span>
          </div>
          <button
            onClick={() => void handleResume()}
            disabled={resuming}
            className="px-3 h-7 rounded-[8px] border border-[rgba(255,159,10,0.35)] text-[12px] text-[#ff9f0a] font-medium hover:bg-[rgba(255,159,10,0.08)] disabled:opacity-50 transition-colors flex items-center gap-1.5 flex-shrink-0"
          >
            {resuming ? <Loader2 size={11} className="animate-spin" /> : <Zap size={11} />}
            {resuming ? 'Loading…' : 'Continue session'}
          </button>
          <button onClick={() => setResumeBanner(false)} className="text-[rgba(235,235,245,0.3)] hover:text-white transition-colors">
            <X size={14} />
          </button>
        </div>
      )}

      {!differentKey ? (
        <div className="flex-1 flex overflow-hidden min-h-0 relative">
          {dragging && <div className="absolute inset-0 z-50" style={{ cursor: 'inherit' }} />}

          {sidebarVisible && (
            <>
              <div style={{ width: sidebarW, flexShrink: 0, minWidth: 180, maxWidth: 480 }} className="flex flex-col overflow-hidden border-r border-white/[0.06]">
                <FileTree projectId={projectId!} />
              </div>
              <ResizeHandle
                onDragStart={() => setDragging(true)}
                onDragEnd={() => setDragging(false)}
                onResize={(delta) => setSidebarW((value) => Math.max(180, Math.min(480, value + delta)))}
              />
            </>
          )}

          {chatVisible && (
            <div className="flex-1 flex flex-col overflow-hidden" style={{ minWidth: 280 }}>
              <ChatPanel projectId={projectId!} disableInput={differentKey} />
            </div>
          )}

          {rightVisible && (
            <>
              <ResizeHandle
                onDragStart={() => setDragging(true)}
                onDragEnd={() => setDragging(false)}
                onResize={(delta) => setRightW((value) => Math.max(280, Math.min(window.innerWidth * 0.7, value - delta)))}
              />
              <div style={{ width: rightW, flexShrink: 0, minWidth: 280, maxWidth: '70vw' }} className="flex flex-col overflow-hidden border-l border-white/[0.06]">
                <div className="flex-1 overflow-hidden min-h-0">
                  <Editor projectId={projectId!} />
                </div>
                {showPreview && (
                  <>
                    <ResizeHandle
                      direction="vertical"
                      onDragStart={() => setDragging(true)}
                      onDragEnd={() => setDragging(false)}
                      onResize={(delta) => setPreviewH((value) => Math.max(120, Math.min(window.innerHeight * 0.65, value - delta)))}
                    />
                    <div style={{ height: previewH, flexShrink: 0 }} className="overflow-hidden">
                      <Preview projectId={projectId!} />
                    </div>
                  </>
                )}
                {showTerminal && (
                  <>
                    <ResizeHandle
                      direction="vertical"
                      onDragStart={() => setDragging(true)}
                      onDragEnd={() => setDragging(false)}
                      onResize={(delta) => setTermH((value) => Math.max(100, Math.min(window.innerHeight * 0.55, value - delta)))}
                    />
                    <div style={{ height: termH, flexShrink: 0 }} className="overflow-hidden">
                      <TerminalPanel projectId={projectId!} />
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-md">
            <div className="w-16 h-16 rounded-2xl bg-[#ff9f0a]/10 border border-[#ff9f0a]/20 flex items-center justify-center mx-auto mb-4">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-[#ff9f0a]" strokeWidth="2">
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
            </div>
            <h2 className="text-[18px] font-semibold text-white mb-2">Project Migration Required</h2>
            <p className="text-[14px] text-white/50 mb-6">
              This project was created with a different API key. Click below to migrate it to your current key.
            </p>
            <button
              onClick={() => continuationStore.setShowDialog(true)}
              className="px-6 py-2.5 rounded-xl bg-[#0a84ff] hover:bg-[#0a84ff]/90 text-white font-medium transition-colors"
            >
              Migrate Project
            </button>
          </div>
        </div>
      )}

      <BackupDialog open={showBackups} onClose={() => setShowBackups(false)} projectId={projectId!} />
      <CreditsDialog open={showCredits} onClose={() => setShowCredits(false)} />
      <KeyRecoveryDialog
        open={showKeyRecovery}
        onClose={() => setShowKeyRecovery(false)}
        onRecovered={handleKeyRecovered}
        projectId={projectId}
        projectName={project?.name}
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
