import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight, Loader2, Check, AlertTriangle, Key, Clock,
  Database, Sparkles, ShieldCheck, FolderGit2, MessageSquare,
  RefreshCw, X, ExternalLink, Layers, Zap,
} from 'lucide-react'
import { useContinuationStore } from '../../store/continuation'
import { api } from '../../lib/api'
import { cn, formatRelative } from '../../lib/utils'

interface Props {
  open: boolean
  projectId: string
  projectName: string
  snapshotAt: string | null
  onSuccess: (newProjectId: string) => void
  onClose: () => void
}

const STAGES = [
  { id: 'queued',                label: 'Queueing migration',      detail: 'Pinning context and reserving capacity' },
  { id: 'creating_target',       label: 'Creating destination',    detail: 'Provisioning a new project under the active key' },
  { id: 'acquiring_target',      label: 'Acquiring sandbox',       detail: 'Booting an isolated build environment' },
  { id: 'transferring_snapshot', label: 'Transferring snapshot',   detail: 'Streaming files and history into the new home' },
  { id: 'verifying_target',      label: 'Verifying destination',   detail: 'Sanity-checking the restored workspace' },
  { id: 'completed',             label: 'Migration complete',      detail: 'Your project is online with the new key' },
] as const

const PRESERVED = [
  { icon: FolderGit2,    label: 'Source files',    detail: 'Full tree, byte-for-byte' },
  { icon: MessageSquare, label: 'Chat history',    detail: 'Every session and message' },
  { icon: Database,      label: 'Latest snapshot', detail: 'Restorable at any time' },
  { icon: Layers,        label: 'Models & config', detail: 'Defaults travel with you' },
]

const ERROR_HINTS: Record<string, string> = {
  ACQUIRE_TARGET_TIMEOUT: 'The destination sandbox took too long to boot. Retry — usually clears within a minute.',
  SNAPSHOT_TRANSFER_FAILED: 'A file transfer step failed. Your source project is untouched. Retrying is safe.',
  VERIFY_TARGET_FAILED: 'The destination didn’t pass verification. Source is preserved — we’ll start fresh on retry.',
  TARGET_CREATE_FAILED: 'We couldn’t create the destination project. Check that your new key has space for one more project.',
  SOURCE_LOCKED: 'The source project is in use by another tab. Close other workspaces and retry.',
}

function fmtElapsed(ms: number): string {
  if (ms < 1000) return '0s'
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const rs = s % 60
  return `${m}m ${rs}s`
}

export function ContinuationDialog({ open, projectId, projectName, snapshotAt, onSuccess, onClose }: Props) {
  const {
    migrating,
    migrateError,
    migrationId,
    migrationStage,
    migrationStatus,
    migrationMessage,
    migrationTargetProjectId,
    sourcePreserved,
    setMigrating,
    setMigrateError,
    setMigrationState,
  } = useContinuationStore()

  const [done, setDone] = useState(false)
  const [errorCode, setErrorCode] = useState<string | null>(null)
  const [stageStartedAt, setStageStartedAt] = useState<number>(() => Date.now())
  const [stageElapsed, setStageElapsed] = useState<number>(0)
  const [overallStartedAt, setOverallStartedAt] = useState<number | null>(null)
  const [overallElapsed, setOverallElapsed] = useState<number>(0)
  const lastStageRef = useRef<string | null>(null)

  // Reset volatile state when dialog re-opens
  useEffect(() => {
    if (!open) {
      setDone(false)
      setErrorCode(null)
      setOverallStartedAt(null)
      setOverallElapsed(0)
      setStageElapsed(0)
      lastStageRef.current = null
    }
  }, [open])

  // Track per-stage and overall elapsed time
  useEffect(() => {
    if (!migrating) return
    const tick = () => {
      setStageElapsed(Date.now() - stageStartedAt)
      if (overallStartedAt) setOverallElapsed(Date.now() - overallStartedAt)
    }
    tick()
    const id = window.setInterval(tick, 250)
    return () => window.clearInterval(id)
  }, [migrating, stageStartedAt, overallStartedAt])

  // Reset stage timer when stage advances
  useEffect(() => {
    if (migrationStage && migrationStage !== lastStageRef.current) {
      lastStageRef.current = migrationStage
      setStageStartedAt(Date.now())
      setStageElapsed(0)
    }
  }, [migrationStage])

  // Polling loop
  useEffect(() => {
    if (!open || !migrating || !migrationId) return
    let cancelled = false
    let timer: number | undefined

    const poll = async () => {
      try {
        const response = await api.migrationStatus(migrationId)
        const migration = response.migration as any
        if (cancelled) return

        setMigrationState({
          migrationId: migration.id,
          migrationStage: migration.stage,
          migrationStatus: migration.status,
          migrationMessage: migration.stageMessage || migration.warning || '',
          migrationTargetProjectId: migration.targetProjectId,
          sourcePreserved: migration.sourcePreserved,
        })

        if (migration.status === 'completed' && migration.targetProjectId) {
          setDone(true)
          setMigrating(false)
          // brief celebration before navigation
          window.setTimeout(() => onSuccess(migration.targetProjectId), 900)
          return
        }

        if (migration.status === 'failed' || migration.status === 'partial_failed') {
          setMigrating(false)
          setErrorCode(migration.errorCode || null)
          setMigrateError(migration.errorMessage || migration.warning || 'Migration failed unexpectedly.')
          return
        }

        timer = window.setTimeout(() => { void poll() }, 1100)
      } catch (error) {
        if (cancelled) return
        setMigrating(false)
        setMigrateError(error instanceof Error ? error.message : String(error))
      }
    }

    void poll()

    return () => {
      cancelled = true
      if (timer) window.clearTimeout(timer)
    }
  }, [migrationId, migrating, onSuccess, open, setMigrateError, setMigrating, setMigrationState])

  const handleStart = async () => {
    setMigrateError(null)
    setErrorCode(null)
    setDone(false)
    setMigrating(true)
    setOverallStartedAt(Date.now())
    setOverallElapsed(0)
    setStageStartedAt(Date.now())
    setStageElapsed(0)
    lastStageRef.current = null

    try {
      const result = await api.enactContinuation(projectId)
      const migration = result.migration as any

      setMigrationState({
        migrationId: migration.id,
        migrationStage: migration.stage,
        migrationStatus: migration.status,
        migrationMessage: migration.stageMessage || migration.warning || '',
        migrationTargetProjectId: migration.targetProjectId,
        sourcePreserved: migration.sourcePreserved,
      })

      if (migration.status === 'completed' && migration.targetProjectId) {
        setDone(true)
        setMigrating(false)
        window.setTimeout(() => onSuccess(migration.targetProjectId), 900)
      }
    } catch (error) {
      setMigrating(false)
      setMigrateError(error instanceof Error ? error.message : String(error))
    }
  }

  const currentStageIndex = useMemo(
    () => STAGES.findIndex(s => s.id === migrationStage),
    [migrationStage],
  )

  const completionPct = useMemo(() => {
    if (done || migrationStatus === 'completed') return 100
    if (currentStageIndex < 0) return 0
    return Math.min(98, Math.round(((currentStageIndex + 0.5) / STAGES.length) * 100))
  }, [currentStageIndex, done, migrationStatus])

  const inProgress = migrating || (migrationStatus && migrationStatus !== 'completed' && migrationStatus !== 'failed' && migrationStatus !== 'partial_failed')
  const showTimeline = inProgress || done || !!migrateError
  const errorHint = errorCode ? ERROR_HINTS[errorCode] : null

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
      <div
        className="absolute inset-0 bg-black/75 backdrop-blur-2xl animate-fade-in"
        onClick={!migrating && !done ? onClose : undefined}
      />

      <div className="relative w-full max-w-[520px] animate-slide-in">
        <div className="relative rounded-[22px] bg-[#0c0c0e] border border-white/[0.08] overflow-hidden shadow-[0_30px_120px_rgba(0,0,0,0.7)]">
          {/* Top accent rail with active animation */}
          <div className="relative h-[3px] w-full bg-white/[0.04] overflow-hidden">
            <div
              className={cn(
                'absolute inset-y-0 left-0 transition-[width] duration-700 ease-out',
                migrateError ? 'bg-[#ff453a]' : done ? 'bg-[#30d158]' : 'bg-gradient-to-r from-[#ff9f0a] via-[#ff6a00] to-[#ff9f0a]',
              )}
              style={{ width: showTimeline ? `${completionPct}%` : '100%' }}
            />
            {showTimeline && !migrateError && !done && (
              <div className="absolute inset-y-0 left-0 w-full opacity-40 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.6),transparent)] animate-[shimmer_1.6s_linear_infinite]" />
            )}
          </div>

          {/* Close (only available when idle) */}
          {!migrating && !done && (
            <button
              onClick={onClose}
              className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full flex items-center justify-center text-white/40 hover:text-white hover:bg-white/[0.06] transition-colors"
              aria-label="Close"
            >
              <X size={15} />
            </button>
          )}

          {/* Hero */}
          <div
            className="relative px-7 pt-7 pb-6 overflow-hidden"
            style={{ background: 'radial-gradient(120% 100% at 0% 0%, rgba(255,159,10,0.10) 0%, transparent 60%)' }}
          >
            <div className="absolute -top-16 -right-12 w-44 h-44 rounded-full opacity-25 blur-[60px] bg-[#ff9f0a]" />

            <div className="relative">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#ff9f0a]">
                  {done ? 'Migration complete' : migrateError ? 'Migration paused' : 'Continuation required'}
                </span>
                <span className="w-1 h-1 rounded-full bg-white/20" />
                <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-white/35 truncate max-w-[260px]">
                  {projectName}
                </span>
              </div>

              <div className="flex items-start gap-4">
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 relative"
                  style={{
                    background: done
                      ? 'linear-gradient(135deg, rgba(48,209,88,0.18) 0%, rgba(48,209,88,0.06) 100%)'
                      : migrateError
                      ? 'linear-gradient(135deg, rgba(255,69,58,0.18) 0%, rgba(255,69,58,0.06) 100%)'
                      : 'linear-gradient(135deg, rgba(255,159,10,0.18) 0%, rgba(255,159,10,0.06) 100%)',
                    border: `1px solid ${done ? 'rgba(48,209,88,0.25)' : migrateError ? 'rgba(255,69,58,0.25)' : 'rgba(255,159,10,0.25)'}`,
                    boxShadow: done
                      ? '0 0 32px rgba(48,209,88,0.18) inset'
                      : migrateError
                      ? '0 0 32px rgba(255,69,58,0.18) inset'
                      : '0 0 32px rgba(255,159,10,0.18) inset',
                  }}
                >
                  {done ? (
                    <Check size={24} className="text-[#30d158]" strokeWidth={2.5} />
                  ) : migrateError ? (
                    <AlertTriangle size={22} className="text-[#ff453a]" />
                  ) : (
                    <Key size={22} className="text-[#ff9f0a]" />
                  )}
                </div>
                <div className="flex-1 min-w-0 pt-0.5">
                  <h2 className="text-[19px] font-bold text-white leading-tight tracking-tight">
                    {done ? 'You’re back online' : migrateError ? 'We hit a snag' : 'Continue under your new key'}
                  </h2>
                  <p className="text-[13px] mt-1.5 leading-relaxed text-white/55">
                    {done
                      ? 'The destination project is ready. Opening it now…'
                      : migrateError
                      ? 'The source project is untouched. Retry safely from any stage.'
                      : 'We’ll fork this project into a new one bound to your active API key — files, sessions, and snapshots come with it.'}
                  </p>
                </div>
              </div>

              {/* Key transition visual (preview only) */}
              {!showTimeline && (
                <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                  <div className="flex items-center gap-2 h-10 px-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                    <div className="w-7 h-7 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center">
                      <Key size={12} className="text-white/40" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-white/35 leading-none">Original</div>
                      <div className="text-[12px] font-medium text-white/70 truncate leading-tight mt-0.5">Locked key</div>
                    </div>
                  </div>
                  <div className="w-9 h-9 rounded-full bg-[#ff9f0a]/10 border border-[#ff9f0a]/20 flex items-center justify-center">
                    <ArrowRight size={13} className="text-[#ff9f0a]" />
                  </div>
                  <div className="flex items-center gap-2 h-10 px-3 rounded-xl bg-[#ff9f0a]/[0.06] border border-[#ff9f0a]/20">
                    <div className="w-7 h-7 rounded-lg bg-[#ff9f0a]/15 border border-[#ff9f0a]/25 flex items-center justify-center">
                      <Sparkles size={12} className="text-[#ff9f0a]" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-[#ff9f0a]/70 leading-none">Active key</div>
                      <div className="text-[12px] font-medium text-white truncate leading-tight mt-0.5">New project home</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Live overall progress strip */}
              {showTimeline && (
                <div className="mt-5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-white/45">
                      {done ? 'Completed' : migrateError ? 'Paused' : 'In progress'}
                    </span>
                    <span className="text-[11px] font-mono tabular-nums text-white/45">
                      {overallStartedAt ? fmtElapsed(overallElapsed) : '0s'} · {completionPct}%
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-white/[0.05] overflow-hidden">
                    <div
                      className={cn(
                        'h-full transition-[width] duration-500 ease-out rounded-full',
                        done ? 'bg-[#30d158]' : migrateError ? 'bg-[#ff453a]' : 'bg-gradient-to-r from-[#ff9f0a] to-[#ff6a00]',
                      )}
                      style={{ width: `${completionPct}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Body */}
          <div className="px-7 pb-6 pt-2">
            {showTimeline ? (
              <div className="relative pl-7 mb-5">
                {/* Spine */}
                <div className="absolute left-[10px] top-2 bottom-2 w-px bg-white/[0.08]" />
                {STAGES.map((step, index) => {
                  const isCompleted = (currentStageIndex > index) || done
                  const isCurrent = currentStageIndex === index && !done && !migrateError
                  const isFailed = currentStageIndex === index && !!migrateError

                  return (
                    <div key={step.id} className="relative pb-3 last:pb-0">
                      {/* Marker */}
                      <div
                        className={cn(
                          'absolute -left-7 top-0.5 w-5 h-5 rounded-full flex items-center justify-center border-2 transition-all',
                          isCompleted && 'border-[#30d158] bg-[#30d158]/15',
                          isFailed && 'border-[#ff453a] bg-[#ff453a]/15',
                          isCurrent && 'border-[#0a84ff] bg-[#0a84ff]/15 shadow-[0_0_0_4px_rgba(10,132,255,0.12)]',
                          !isCompleted && !isCurrent && !isFailed && 'border-white/15 bg-[#0c0c0e]',
                        )}
                      >
                        {isCompleted ? (
                          <Check size={11} className="text-[#30d158]" strokeWidth={3} />
                        ) : isFailed ? (
                          <AlertTriangle size={10} className="text-[#ff453a]" />
                        ) : isCurrent ? (
                          <Loader2 size={10} className="text-[#0a84ff] animate-spin" />
                        ) : (
                          <span className="w-1.5 h-1.5 rounded-full bg-white/25" />
                        )}
                      </div>

                      <div className="flex items-baseline justify-between gap-3">
                        <span
                          className={cn(
                            'text-[13.5px] font-semibold leading-tight',
                            isCompleted && 'text-[#30d158]',
                            isFailed && 'text-[#ff453a]',
                            isCurrent && 'text-white',
                            !isCompleted && !isCurrent && !isFailed && 'text-white/40',
                          )}
                        >
                          {step.label}
                        </span>
                        {isCurrent && (
                          <span className="text-[10.5px] font-mono tabular-nums text-[#0a84ff]/80 flex-shrink-0">
                            {fmtElapsed(stageElapsed)}
                          </span>
                        )}
                      </div>
                      <div
                        className={cn(
                          'text-[11.5px] leading-snug mt-0.5',
                          isCurrent ? 'text-white/55' : isCompleted ? 'text-white/35' : isFailed ? 'text-[#ff453a]/70' : 'text-white/25',
                        )}
                      >
                        {step.detail}
                      </div>
                      {isCurrent && migrationMessage && (
                        <div className="mt-1.5 text-[11px] font-mono text-[#0a84ff]/70 truncate">
                          {migrationMessage}
                        </div>
                      )}
                      {isFailed && migrateError && (
                        <div className="mt-2 rounded-lg bg-[#ff453a]/[0.06] border border-[#ff453a]/15 px-3 py-2 space-y-1.5">
                          {errorCode && (
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[10px] bg-[#ff453a]/15 text-[#ff453a] px-1.5 py-0.5 rounded">
                                {errorCode}
                              </span>
                              <span className="text-[11px] font-medium text-[#ff453a]">Stage failure</span>
                            </div>
                          )}
                          <div className="text-[12px] text-[#ff453a]/90 leading-snug break-words">{migrateError}</div>
                          {errorHint && (
                            <div className="text-[11px] text-white/45 leading-snug">{errorHint}</div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <>
                {/* Preserved grid */}
                <div className="rounded-2xl bg-white/[0.02] border border-white/[0.05] p-3.5 mb-4">
                  <div className="flex items-center gap-2 mb-2.5">
                    <ShieldCheck size={13} className="text-[#30d158]" />
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#30d158]">
                      What carries over
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                    {PRESERVED.map((p) => (
                      <div key={p.label} className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-md bg-[#30d158]/[0.08] border border-[#30d158]/[0.15] flex items-center justify-center flex-shrink-0">
                          <p.icon size={11} className="text-[#30d158]" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-[12px] font-medium text-white/85 leading-tight truncate">{p.label}</div>
                          <div className="text-[10.5px] text-white/35 leading-tight truncate">{p.detail}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Snapshot status */}
                {snapshotAt ? (
                  <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-[#30d158]/[0.05] border border-[#30d158]/15 mb-4">
                    <Clock size={13} className="text-[#30d158] flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-semibold text-[#30d158]">Snapshot ready</div>
                      <div className="text-[11px] text-white/45">
                        Captured {formatRelative(snapshotAt)} · streamed at full fidelity
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl bg-[#ff9f0a]/[0.06] border border-[#ff9f0a]/15 mb-4">
                    <AlertTriangle size={13} className="text-[#ff9f0a] flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-semibold text-[#ff9f0a]">No snapshot yet</div>
                      <div className="text-[11px] text-white/45 leading-snug">
                        We’ll capture from the live workspace. Open this project under its original key first for a verified snapshot.
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Source preserved badge during error */}
            {migrateError && sourcePreserved && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#30d158]/[0.06] border border-[#30d158]/15 mb-3">
                <ShieldCheck size={12} className="text-[#30d158] flex-shrink-0" />
                <span className="text-[11.5px] text-[#30d158] font-medium">
                  Source project intact — nothing was lost
                </span>
              </div>
            )}

            {/* Success card */}
            {done && migrationTargetProjectId && (
              <div
                className="rounded-2xl p-4 mb-3 animate-fade-in"
                style={{
                  background: 'linear-gradient(135deg, rgba(48,209,88,0.10) 0%, rgba(48,209,88,0.04) 100%)',
                  border: '1px solid rgba(48,209,88,0.25)',
                  boxShadow: '0 0 36px rgba(48,209,88,0.10)',
                }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Zap size={13} className="text-[#30d158]" />
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#30d158]">New home</span>
                </div>
                <div className="font-mono text-[11px] text-white/65 break-all">{migrationTargetProjectId}</div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2.5">
              {done ? (
                <button
                  onClick={() => migrationTargetProjectId && onSuccess(migrationTargetProjectId)}
                  className="flex-1 h-12 rounded-xl text-[14px] font-bold flex items-center justify-center gap-2 text-black bg-[#30d158] hover:bg-[#3de066] transition-all shadow-[0_6px_22px_rgba(48,209,88,0.30)]"
                >
                  <ArrowRight size={15} />
                  Open new project
                </button>
              ) : (
                <>
                  <button
                    onClick={onClose}
                    disabled={migrating}
                    className="flex-1 h-12 rounded-xl text-[13.5px] font-medium bg-white/[0.04] border border-white/[0.08] text-white/55 hover:bg-white/[0.08] hover:text-white/90 transition-all disabled:opacity-40"
                  >
                    {migrating ? 'Running…' : 'Cancel'}
                  </button>
                  <button
                    onClick={() => void handleStart()}
                    disabled={migrating}
                    className={cn(
                      'flex-1 h-12 rounded-xl text-[13.5px] font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed',
                      migrateError
                        ? 'bg-[#ff453a] text-white hover:bg-[#ff5d52] shadow-[0_6px_22px_rgba(255,69,58,0.30)]'
                        : 'text-black hover:opacity-95',
                    )}
                    style={
                      !migrateError
                        ? { background: 'linear-gradient(135deg, #ff9f0a 0%, #e08800 100%)', boxShadow: '0 6px 22px rgba(255,159,10,0.30)' }
                        : undefined
                    }
                  >
                    {migrating ? (
                      <>
                        <Loader2 size={15} className="animate-spin" />
                        Migrating…
                      </>
                    ) : migrateError ? (
                      <>
                        <RefreshCw size={14} />
                        Retry migration
                      </>
                    ) : (
                      <>
                        <Sparkles size={14} />
                        Start migration
                        <ArrowRight size={14} />
                      </>
                    )}
                  </button>
                </>
              )}
            </div>

            {/* Footer help */}
            <div className="flex items-center justify-between mt-4 text-[10.5px] text-white/30">
              <span>Continuation is the heart of this app — failures are recoverable.</span>
              {migrateError && (
                <a
                  href="https://vibecode.dev/help/migration"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1 text-white/45 hover:text-white/80 transition-colors"
                >
                  Get help <ExternalLink size={9} />
                </a>
              )}
            </div>
          </div>
        </div>
      </div>

      <style>{`@keyframes shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }`}</style>
    </div>
  )
}
