import { useState, useEffect } from 'react'
import { Eye, EyeOff, Check } from 'lucide-react'
import { Dialog } from '../ui/Dialog'
import { Button } from '../ui/Button'
import { LowCreditsDialog } from './LowCreditsDialog'
import { useAuthStore } from '../../store/auth'
import { api } from '../../lib/api'


interface Props {
  open: boolean
  onClose: () => void
  onRecovered: () => void
  projectId?: string
  reason?: 'credits' | 'forbidden' | 'unauthorized'
}

export function KeyRecoveryDialog({ open, onClose, onRecovered, projectId, reason = 'credits' }: Props) {
  const { credits, refreshCredits } = useAuthStore()
  const [newKey, setNewKey] = useState('')
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [recovered, setRecovered] = useState(false)
  const [showLowCreditsWarning, setShowLowCreditsWarning] = useState(false)
  const [pendingKeyData, setPendingKeyData] = useState<any>(null)

  const isForbidden = reason === 'forbidden' || reason === 'unauthorized'

  useEffect(() => {
    if (open) {
      setNewKey(''); setError(''); setRecovered(false)
    }
  }, [open])

  const handleSubmit = async () => {
    if (!newKey.trim()) return
    setLoading(true); setError('')
    try {
      const result = await api.rotateKey(newKey.trim())
      if (result.lowCredits) {
        setPendingKeyData(result)
        setShowLowCreditsWarning(true)
        setLoading(false)
        return
      }
      await refreshCredits()
      setRecovered(true)
      setTimeout(() => { onRecovered(); onClose() }, 1200)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg.includes('zero credits') || msg.includes('ZERO_CREDITS')
        ? 'This key has zero credits. Add credits at vibecode.dev/payments.'
        : msg)
    } finally {
      setLoading(false)
    }
  }

  const handleLowCreditsConfirm = async () => {
    setShowLowCreditsWarning(false)
    await refreshCredits()
    setRecovered(true)
    setTimeout(() => { onRecovered(); onClose() }, 1200)
  }

  return (
    <>
      <Dialog open={open} onClose={onClose} title="" width={420} hideClose>
        <div className="flex flex-col gap-0 -m-5">
          {/* Hero banner */}
          <div className="relative overflow-hidden px-6 pt-7 pb-6"
            style={{ background: isForbidden ? 'linear-gradient(135deg, rgba(255,69,58,0.08) 0%, rgba(255,69,58,0.03) 100%)' : 'linear-gradient(135deg, rgba(255,159,10,0.08) 0%, rgba(255,159,10,0.03) 100%)' }}>
            {/* Glow orb */}
            <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full opacity-20 blur-2xl"
              style={{ background: isForbidden ? '#ff453a' : '#ff9f0a' }} />
            <div className="relative flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{ background: isForbidden ? 'rgba(255,69,58,0.12)' : 'rgba(255,159,10,0.12)', border: `1px solid ${isForbidden ? 'rgba(255,69,58,0.2)' : 'rgba(255,159,10,0.2)'}` }}>
                {isForbidden ? (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={isForbidden ? '#ff453a' : '#ff9f0a'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                ) : (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ff9f0a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
                    <line x1="1" y1="10" x2="23" y2="10"/>
                  </svg>
                )}
              </div>
              <div>
                <p className="text-[17px] font-semibold text-white leading-tight">
                  {isForbidden ? 'Invalid API Key' : 'Credits Exhausted'}
                </p>
                <p className="text-[13px] mt-0.5" style={{ color: 'rgba(235,235,245,0.45)' }}>
                  {isForbidden
                    ? 'Your key is invalid or restricted'
                    : 'Enter a new key to keep going'}
                  {projectId ? ` · Project ${projectId}` : ''}
                </p>
              </div>
            </div>

            {/* Current balance pill */}
            {credits && !isForbidden && (
              <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full"
                style={{ background: 'rgba(255,159,10,0.08)', border: '1px solid rgba(255,159,10,0.15)' }}>
                <span className="text-[12px]" style={{ color: 'rgba(255,159,10,0.6)' }}>Balance:</span>
                <span className="text-[13px] font-semibold tabular-nums" style={{ color: '#ff9f0a' }}>
                  ${credits.balance.toFixed(2)}
                </span>
              </div>
            )}
          </div>

          {/* Body */}
          <div className="px-6 py-5 flex flex-col gap-4">
            {/* Key input */}
            <div className="flex flex-col gap-2">
              <label className="text-[12px] font-medium" style={{ color: 'rgba(235,235,245,0.5)' }}>
                New API Key
              </label>
              <div className="relative">
                <input
                  type={show ? 'text' : 'password'}
                  value={newKey}
                  onChange={e => { setNewKey(e.target.value); setError('') }}
                  onKeyDown={e => e.key === 'Enter' && !loading && handleSubmit()}
                  placeholder="vibecode_sk_..."
                  autoFocus
                  className="w-full h-11 rounded-xl bg-white/[0.05] border text-[14px] text-white px-4 pr-12 font-mono placeholder:text-white/20 focus:outline-none transition-all"
                  style={{
                    borderColor: error ? 'rgba(255,69,58,0.4)' : 'rgba(255,255,255,0.1)',
                    boxShadow: error ? '0 0 0 3px rgba(255,69,58,0.08)' : newKey ? '0 0 0 3px rgba(10,132,255,0.08)' : 'none',
                  }}
                  onFocus={e => { if (!error) (e.target as HTMLElement).style.borderColor = 'rgba(10,132,255,0.5)' }}
                  onBlur={e => { if (!error) (e.target as HTMLElement).style.borderColor = 'rgba(255,255,255,0.1)' }}
                />
                <button onClick={() => setShow(s => !s)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 transition-colors"
                  style={{ color: 'rgba(235,235,245,0.3)' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(235,235,245,0.6)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(235,235,245,0.3)' }}>
                  {show ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {error && (
                <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl text-[12px]"
                  style={{ background: 'rgba(255,69,58,0.06)', border: '1px solid rgba(255,69,58,0.15)', color: '#ff453a' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0 mt-0.5">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  {error}
                </div>
              )}
            </div>

            {/* Actions */}
            {recovered ? (
              <div className="flex items-center justify-center gap-2.5 h-11 rounded-xl text-[14px] font-semibold"
                style={{ background: 'rgba(48,209,88,0.08)', border: '1px solid rgba(48,209,88,0.2)', color: '#30d158' }}>
                <Check size={16} />
                Key updated — resuming…
              </div>
            ) : (
              <div className="flex gap-2.5">
                <button onClick={onClose}
                  className="flex-1 h-11 rounded-xl text-[14px] font-medium transition-all"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(235,235,245,0.5)' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.09)'; (e.currentTarget as HTMLElement).style.color = 'rgba(235,235,245,0.8)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)'; (e.currentTarget as HTMLElement).style.color = 'rgba(235,235,245,0.5)' }}>
                  Cancel
                </button>
                <button onClick={handleSubmit} disabled={!newKey.trim() || loading}
                  className="flex-1 h-11 rounded-xl text-[14px] font-semibold transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ background: 'linear-gradient(135deg, #0a84ff 0%, #0066d6 100%)', color: 'white', boxShadow: newKey.trim() ? '0 4px 16px rgba(10,132,255,0.25)' : 'none' }}>
                  {loading ? (
                    <svg width="16" height="16" viewBox="0 0 16 16" style={{ animation: 'spin 0.7s linear infinite' }}>
                      <circle cx="8" cy="8" r="6" fill="none" stroke="white" strokeWidth="2" strokeDasharray="28" strokeDashoffset="10"/>
                    </svg>
                  ) : 'Continue with new key'}
                </button>
              </div>
            )}

            <p className="text-center text-[11px]" style={{ color: 'rgba(235,235,245,0.2)' }}>
              Your project, sessions, and files are preserved
            </p>
          </div>
        </div>
      </Dialog>

      {showLowCreditsWarning && pendingKeyData && (
        <LowCreditsDialog
          open={showLowCreditsWarning}
          balance={pendingKeyData.balanceInDollars || 0}
          onConfirm={handleLowCreditsConfirm}
          onCancel={() => { setShowLowCreditsWarning(false); setPendingKeyData(null); setNewKey('') }}
        />
      )}
    </>
  )
}
