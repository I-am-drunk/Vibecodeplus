import { useState, useEffect, useMemo } from 'react'
import {
  Eye, EyeOff, Check, Loader2, AlertTriangle, Lock, CreditCard,
  ShieldCheck, ExternalLink, Sparkles, ArrowRight, X, KeyRound,
  Database, MessageSquare, FolderGit2, ClipboardPaste,
} from 'lucide-react'
import { LowCreditsDialog } from './LowCreditsDialog'
import { useAuthStore } from '../../store/auth'
import { api } from '../../lib/api'
import { cn } from '../../lib/utils'

interface Props {
  open: boolean
  onClose: () => void
  onRecovered: () => void
  projectId?: string
  projectName?: string
  reason?: 'credits' | 'forbidden' | 'unauthorized'
}

type Phase = 'input' | 'validating' | 'success'

const REASON_THEME = {
  credits: {
    accent: '#ff9f0a',
    accentRgb: '255,159,10',
    icon: CreditCard,
    eyebrow: 'Credits exhausted',
    title: 'Top up to keep building',
    blurb: 'Your current key has run out of credits. Paste a new key to continue exactly where you left off.',
    cta: 'Resume with new key',
    helper: 'Get more credits at',
    helperUrl: 'https://vibecode.dev/payments',
    helperLabel: 'vibecode.dev/payments',
  },
  forbidden: {
    accent: '#ff453a',
    accentRgb: '255,69,58',
    icon: Lock,
    eyebrow: 'Access denied',
    title: 'API key not authorized',
    blurb: 'This key was rejected by the gateway. It may be revoked, scoped to a different account, or rate-limited.',
    cta: 'Sign in with another key',
    helper: 'Need a new key? Visit',
    helperUrl: 'https://vibecode.dev/keys',
    helperLabel: 'vibecode.dev/keys',
  },
  unauthorized: {
    accent: '#ff453a',
    accentRgb: '255,69,58',
    icon: KeyRound,
    eyebrow: 'Authentication failed',
    title: 'Your session needs a key',
    blurb: 'We couldn’t verify the key on this request. Paste an active key to bring this project back online.',
    cta: 'Authenticate & resume',
    helper: 'Don’t have a key yet?',
    helperUrl: 'https://vibecode.dev/keys',
    helperLabel: 'vibecode.dev/keys',
  },
} as const

const PRESERVED = [
  { icon: MessageSquare, label: 'All chat sessions', detail: 'Every prompt and reply' },
  { icon: FolderGit2,    label: 'Project files',     detail: 'Source, history, and tree' },
  { icon: Database,      label: 'Latest snapshot',   detail: 'Restorable in one click' },
  { icon: ShieldCheck,   label: 'Settings & models', detail: 'Selections roll forward' },
]

function maskTail(key: string): string {
  const trimmed = key.trim()
  if (!trimmed) return ''
  if (trimmed.length <= 8) return trimmed
  return `••••${trimmed.slice(-4)}`
}

export function KeyRecoveryDialog({ open, onClose, onRecovered, projectName, reason = 'credits' }: Props) {
  const { credits, refreshCredits } = useAuthStore()
  const [newKey, setNewKey] = useState('')
  const [show, setShow] = useState(false)
  const [phase, setPhase] = useState<Phase>('input')
  const [error, setError] = useState('')
  const [showLowCreditsWarning, setShowLowCreditsWarning] = useState(false)
  const [pendingKeyData, setPendingKeyData] = useState<any>(null)
  const [justPasted, setJustPasted] = useState(false)

  const theme = REASON_THEME[reason]
  const Icon = theme.icon

  useEffect(() => {
    if (open) {
      setNewKey('')
      setError('')
      setPhase('input')
      setShow(false)
      setJustPasted(false)
    }
  }, [open])

  useEffect(() => {
    if (!justPasted) return
    const t = setTimeout(() => setJustPasted(false), 900)
    return () => clearTimeout(t)
  }, [justPasted])

  const trimmed = newKey.trim()
  const looksValid = useMemo(() => trimmed.length >= 12, [trimmed])

  const handleSubmit = async () => {
    if (!trimmed || phase === 'validating') return
    setPhase('validating')
    setError('')
    try {
      const result = await api.rotateKey(trimmed)
      if (result.lowCredits) {
        setPendingKeyData(result)
        setShowLowCreditsWarning(true)
        setPhase('input')
        return
      }
      await refreshCredits()
      setPhase('success')
      // brief success beat before closing
      setTimeout(() => {
        onRecovered()
        onClose()
      }, 700)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const isZero = msg.includes('zero credits') || msg.includes('ZERO_CREDITS')
      setError(
        isZero
          ? 'This key has no credits. Add funds or paste a different key.'
          : msg.length > 220 ? msg.slice(0, 220) + '…' : msg,
      )
      setPhase('input')
    }
  }

  const handleLowCreditsConfirm = async () => {
    setShowLowCreditsWarning(false)
    await refreshCredits()
    setPhase('success')
    setTimeout(() => {
      onRecovered()
      onClose()
    }, 700)
  }

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text) {
        setNewKey(text.trim())
        setJustPasted(true)
        setError('')
      }
    } catch {
      // clipboard API blocked; user can paste manually
    }
  }

  if (!open) return null

  return (
    <>
      <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
        <div
          className="absolute inset-0 bg-black/75 backdrop-blur-2xl animate-fade-in"
          onClick={phase === 'input' ? onClose : undefined}
        />

        <div className="relative w-full max-w-[460px] animate-slide-in">
          <div className="relative rounded-[22px] bg-[#0c0c0e] border border-white/[0.08] overflow-hidden shadow-[0_30px_120px_rgba(0,0,0,0.7)]">
            {/* Top accent rail */}
            <div
              className="h-[3px] w-full"
              style={{ background: `linear-gradient(90deg, transparent, ${theme.accent}, transparent)` }}
            />

            {/* Close (only available in input phase) */}
            {phase === 'input' && (
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
              style={{
                background: `radial-gradient(120% 100% at 0% 0%, rgba(${theme.accentRgb},0.10) 0%, transparent 60%)`,
              }}
            >
              <div
                className="absolute -top-16 -right-12 w-44 h-44 rounded-full opacity-25 blur-[60px] pointer-events-none"
                style={{ background: theme.accent }}
              />

              <div className="relative">
                <div className="flex items-center gap-2 mb-3">
                  <span
                    className="text-[10px] font-bold uppercase tracking-[0.18em]"
                    style={{ color: theme.accent }}
                  >
                    {theme.eyebrow}
                  </span>
                  {projectName && (
                    <>
                      <span className="w-1 h-1 rounded-full bg-white/20" />
                      <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-white/35 truncate max-w-[200px]">
                        {projectName}
                      </span>
                    </>
                  )}
                </div>

                <div className="flex items-start gap-4">
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 relative"
                    style={{
                      background: `linear-gradient(135deg, rgba(${theme.accentRgb},0.18) 0%, rgba(${theme.accentRgb},0.06) 100%)`,
                      border: `1px solid rgba(${theme.accentRgb},0.25)`,
                      boxShadow: `0 0 32px rgba(${theme.accentRgb},0.18) inset`,
                    }}
                  >
                    <Icon size={24} style={{ color: theme.accent }} strokeWidth={2} />
                  </div>
                  <div className="flex-1 min-w-0 pt-0.5">
                    <h2 className="text-[19px] font-bold text-white leading-tight tracking-tight">
                      {theme.title}
                    </h2>
                    <p className="text-[13px] mt-1.5 leading-relaxed text-white/55">
                      {theme.blurb}
                    </p>
                  </div>
                </div>

                {/* Status row */}
                {credits && reason === 'credits' && (
                  <div className="mt-5 flex items-center gap-2 flex-wrap">
                    <div
                      className="inline-flex items-center gap-2 h-8 px-3 rounded-full"
                      style={{
                        background: `rgba(${theme.accentRgb},0.10)`,
                        border: `1px solid rgba(${theme.accentRgb},0.20)`,
                      }}
                    >
                      <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: `rgba(${theme.accentRgb},0.65)` }}>
                        Balance
                      </span>
                      <span className="text-[13px] font-bold tabular-nums" style={{ color: theme.accent }}>
                        ${credits.balance.toFixed(2)}
                      </span>
                    </div>
                    <span className="text-[11px] text-white/35">
                      Top up or paste a fresh key below
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Body */}
            <div className="px-7 pb-6 pt-2">
              {/* Preserved list */}
              <div className="rounded-2xl bg-white/[0.02] border border-white/[0.05] p-3.5 mb-5">
                <div className="flex items-center gap-2 mb-2.5">
                  <ShieldCheck size={13} className="text-[#30d158]" />
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#30d158]">
                    Preserved across the swap
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

              {/* Key input */}
              <div className="flex flex-col gap-2 mb-4">
                <div className="flex items-center justify-between">
                  <label className="text-[11.5px] font-semibold uppercase tracking-wider text-white/45">
                    New API key
                  </label>
                  {trimmed && looksValid && (
                    <span className="text-[10.5px] font-mono text-white/40">
                      {maskTail(trimmed)}
                    </span>
                  )}
                </div>

                <div
                  className={cn(
                    'relative rounded-xl transition-all',
                    error
                      ? 'ring-2 ring-[#ff453a]/40'
                      : justPasted
                      ? 'ring-2 ring-[#30d158]/40'
                      : trimmed
                      ? 'ring-2 ring-[#0a84ff]/30'
                      : 'ring-1 ring-white/10',
                  )}
                >
                  <input
                    type={show ? 'text' : 'password'}
                    value={newKey}
                    onChange={(e) => { setNewKey(e.target.value); setError('') }}
                    onPaste={() => setJustPasted(true)}
                    onKeyDown={(e) => e.key === 'Enter' && phase === 'input' && handleSubmit()}
                    placeholder="vibecode_sk_..."
                    autoFocus
                    disabled={phase === 'validating'}
                    spellCheck={false}
                    autoComplete="off"
                    className="w-full h-12 rounded-xl bg-[#08080a] text-[13.5px] text-white px-4 pr-24 font-mono placeholder:text-white/20 focus:outline-none disabled:opacity-50 transition-colors"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={handlePasteFromClipboard}
                      disabled={phase === 'validating'}
                      title="Paste from clipboard"
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-white/35 hover:text-white hover:bg-white/[0.06] transition-colors disabled:opacity-40"
                    >
                      <ClipboardPaste size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setShow((s) => !s)}
                      disabled={phase === 'validating'}
                      title={show ? 'Hide key' : 'Show key'}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-white/35 hover:text-white hover:bg-white/[0.06] transition-colors disabled:opacity-40"
                    >
                      {show ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>

                {error && (
                  <div
                    role="alert"
                    className="flex items-start gap-2 px-3 py-2.5 rounded-xl text-[12px] leading-relaxed bg-[#ff453a]/[0.06] border border-[#ff453a]/15 text-[#ff453a]"
                  >
                    <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
                    <span className="break-words">{error}</span>
                  </div>
                )}

                <a
                  href={theme.helperUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1.5 text-[11.5px] text-white/40 hover:text-white/70 transition-colors w-fit"
                >
                  {theme.helper}
                  <span className="font-medium text-white/60 group-hover:text-white">{theme.helperLabel}</span>
                  <ExternalLink size={10} />
                </a>
              </div>

              {/* Actions */}
              {phase === 'success' ? (
                <div
                  className="flex items-center justify-center gap-2.5 h-12 rounded-xl text-[14px] font-semibold animate-fade-in"
                  style={{
                    background: 'linear-gradient(135deg, rgba(48,209,88,0.14) 0%, rgba(48,209,88,0.06) 100%)',
                    border: '1px solid rgba(48,209,88,0.30)',
                    color: '#30d158',
                    boxShadow: '0 0 28px rgba(48,209,88,0.15)',
                  }}
                >
                  <Check size={16} strokeWidth={2.5} />
                  Key accepted — resuming your work…
                </div>
              ) : (
                <div className="flex gap-2.5">
                  <button
                    onClick={onClose}
                    disabled={phase === 'validating'}
                    className="flex-1 h-12 rounded-xl text-[13.5px] font-medium bg-white/[0.04] border border-white/[0.08] text-white/55 hover:bg-white/[0.08] hover:text-white/90 transition-all disabled:opacity-40"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={!trimmed || phase === 'validating'}
                    className="flex-1 h-12 rounded-xl text-[13.5px] font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed text-white"
                    style={{
                      background: phase === 'validating'
                        ? 'rgba(10,132,255,0.5)'
                        : 'linear-gradient(135deg, #0a84ff 0%, #0066d6 100%)',
                      boxShadow: trimmed && phase !== 'validating' ? '0 6px 22px rgba(10,132,255,0.30)' : 'none',
                    }}
                  >
                    {phase === 'validating' ? (
                      <>
                        <Loader2 size={15} className="animate-spin" />
                        Validating…
                      </>
                    ) : (
                      <>
                        <Sparkles size={14} />
                        {theme.cta}
                        <ArrowRight size={14} />
                      </>
                    )}
                  </button>
                </div>
              )}

              <p className="text-center text-[10.5px] text-white/25 mt-4">
                Keys are encrypted at rest. We never log raw API keys.
              </p>
            </div>
          </div>
        </div>
      </div>

      {showLowCreditsWarning && pendingKeyData && (
        <LowCreditsDialog
          open={showLowCreditsWarning}
          balance={pendingKeyData.balanceInDollars || 0}
          onConfirm={handleLowCreditsConfirm}
          onCancel={() => {
            setShowLowCreditsWarning(false)
            setPendingKeyData(null)
            setNewKey('')
          }}
        />
      )}
    </>
  )
}
