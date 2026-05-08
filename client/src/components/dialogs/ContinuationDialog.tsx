import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, FileArchive, Loader2, Check, AlertTriangle, Key, Clock, Circle } from 'lucide-react'
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
  { id: 'queued', label: 'Queued' },
  { id: 'creating_target', label: 'Creating destination project' },
  { id: 'acquiring_target', label: 'Acquiring destination sandbox' },
  { id: 'transferring_snapshot', label: 'Transferring snapshot' },
  { id: 'verifying_target', label: 'Verifying destination project' },
  { id: 'completed', label: 'Migration completed' },
]

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

  useEffect(() => {
    if (!open) {
      setDone(false)
      setErrorCode(null)
    }
  }, [open])

  useEffect(() => {
    if (!open || !migrating || !migrationId) return

    let timer: number | undefined

    const poll = async () => {
      try {
        const response = await api.migrationStatus(migrationId)
        const migration = response.migration as any

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
          onSuccess(migration.targetProjectId)
          return
        }

        if (migration.status === 'failed' || migration.status === 'partial_failed') {
          setDone(false)
          setMigrating(false)
          setErrorCode(migration.errorCode || null)
          setMigrateError(migration.errorMessage || migration.warning || 'Migration failed')
          return
        }

        timer = window.setTimeout(() => {
          void poll()
        }, 1200)
      } catch (error) {
        setMigrating(false)
        setMigrateError(error instanceof Error ? error.message : String(error))
      }
    }

    void poll()

    return () => {
      if (timer) window.clearTimeout(timer)
    }
  }, [migrationId, migrating, onSuccess, open, setMigrateError, setMigrating, setMigrationState])

  if (!open) return null

  const handleContinue = async () => {
    setMigrateError(null)
    setErrorCode(null)
    setDone(false)
    setMigrating(true)

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
        onSuccess(migration.targetProjectId)
      }
    } catch (error) {
      setMigrateError(error instanceof Error ? error.message : String(error))
      setMigrating(false)
    }
  }

  const currentStageIndex = STAGES.findIndex(s => s.id === migrationStage)

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={!migrating ? onClose : undefined} />
      <div className="relative w-full max-w-[440px] mx-4 bg-[#111113] border border-white/[0.1] rounded-2xl shadow-2xl overflow-hidden animate-slide-in">
        <div className="h-[3px] bg-gradient-to-r from-[#ff9f0a] via-[#ff6a00] to-[#ff9f0a]" />

        <div className="p-7">
          <div className="flex items-start gap-4 mb-6">
            <div className="w-11 h-11 rounded-xl bg-[#ff9f0a]/10 border border-[#ff9f0a]/20 flex items-center justify-center flex-shrink-0">
              <Key size={20} className="text-[#ff9f0a]" />
            </div>
            <div>
              <h2 className="text-[17px] font-bold text-white">Different API Key</h2>
              <p className="text-[13px] text-white/40 mt-0.5">
                <span className="font-medium text-white/60">{projectName}</span> requires a migration to continue.
              </p>
            </div>
          </div>

          {(migrating || migrationStage || migrateError) ? (
            <div className="space-y-4 mb-6 ml-2 border-l border-white/10 pl-6 relative">
              {STAGES.map((step, index) => {
                const isCompleted = currentStageIndex > index || done
                const isCurrent = currentStageIndex === index && !done && !migrateError
                const isFailed = currentStageIndex === index && !!migrateError

                let color = "text-white/30"
                let bgColor = "bg-[#111113]"
                let borderColor = "border-white/10"
                let icon = <Circle size={10} className="text-white/20 fill-current" />

                if (isCompleted) {
                  color = "text-[#30d158]"
                  borderColor = "border-[#30d158]"
                  bgColor = "bg-[#30d158]/20"
                  icon = <Check size={12} className="text-[#30d158]" />
                } else if (isFailed) {
                  color = "text-[#ff453a]"
                  borderColor = "border-[#ff453a]"
                  bgColor = "bg-[#ff453a]/20"
                  icon = <AlertTriangle size={12} className="text-[#ff453a]" />
                } else if (isCurrent) {
                  color = "text-[#0a84ff]"
                  borderColor = "border-[#0a84ff]"
                  bgColor = "bg-[#0a84ff]/20"
                  icon = <Loader2 size={12} className="text-[#0a84ff] animate-spin" />
                }

                return (
                  <div key={step.id} className={cn("relative flex flex-col", color)}>
                    {/* Circle marker placed over the border line */}
                    <div className={cn("absolute -left-[35px] top-1 w-5 h-5 rounded-full border-2 flex items-center justify-center shadow-lg", borderColor, bgColor)}>
                      {icon}
                    </div>
                    <span className="text-[14px] font-medium leading-tight mb-1">{step.label}</span>
                    {isFailed && migrateError && (
                      <div className="mt-1 text-[12px] text-[#ff453a] leading-snug">
                        {errorCode && <span className="font-mono text-[10px] bg-[#ff453a]/20 px-1 rounded mr-1">{errorCode}</span>}
                        {migrateError}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <>
              <div className="space-y-3 mb-6">
                {[
                  {
                    icon: FileArchive,
                    label: snapshotAt ? `Restore ${formatRelative(snapshotAt)} snapshot` : 'Capture current files',
                    color: 'text-[#5ac8fa]',
                    bg: 'bg-[#5ac8fa]/10',
                  },
                  {
                    icon: ArrowRight,
                    label: 'Create new project with the same name',
                    color: 'text-[#30d158]',
                    bg: 'bg-[#30d158]/10',
                  },
                  { icon: Check, label: 'Continue your work seamlessly', color: 'text-[#0a84ff]', bg: 'bg-[#0a84ff]/10' },
                ].map((step, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.06]"
                  >
                    <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0', step.bg)}>
                      <step.icon size={14} className={step.color} />
                    </div>
                    <span className="text-[13px] text-white/65">{step.label}</span>
                  </div>
                ))}
              </div>

              {snapshotAt ? (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-[#30d158]/[0.07] border border-[#30d158]/15 mb-4">
                  <Clock size={12} className="text-[#30d158]" />
                  <span className="text-[12px] text-[#30d158]">Snapshot available from {formatRelative(snapshotAt)}</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-[#ff9f0a]/[0.07] border border-[#ff9f0a]/15 mb-4">
                  <AlertTriangle size={12} className="text-[#ff9f0a]" />
                  <span className="text-[12px] text-[#ff9f0a]">
                    No snapshot yet — open the project with original key first for best results
                  </span>
                </div>
              )}
            </>
          )}

          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={migrating || done}
              className="flex-1 h-11 rounded-xl border border-white/[0.1] text-[14px] text-white/60 hover:bg-white/[0.04] disabled:opacity-40 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => void handleContinue()}
              disabled={migrating || done}
              className={cn(
                "flex-1 h-11 rounded-xl text-white text-[14px] font-semibold disabled:opacity-40 transition-all flex items-center justify-center gap-2",
                migrateError ? "bg-[#ff453a] hover:bg-[#ff554a]" : "bg-[#ff9f0a] hover:bg-[#ffb340] text-black"
              )}
            >
              {migrating ? <Loader2 size={15} className="animate-spin text-black" /> : migrateError ? <ArrowRight size={15} /> : <ArrowRight size={15} className="text-black" />}
              {migrating ? 'Migrating…' : migrateError ? 'Retry Migration' : 'Start Migration'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
