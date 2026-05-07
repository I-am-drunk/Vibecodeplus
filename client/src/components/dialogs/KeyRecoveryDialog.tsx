import { useState, useEffect } from 'react'
import { Eye, EyeOff, AlertTriangle, CreditCard, Check, Loader2 } from 'lucide-react'
import { Dialog } from '../ui/Dialog'
import { Button } from '../ui/Button'
import { useAuthStore } from '../../store/auth'
import { api } from '../../lib/api'
import { addClientLog } from '../../lib/serverLogs'

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

  const isForbidden = reason === 'forbidden' || reason === 'unauthorized'
  const title = isForbidden ? 'API key invalid' : 'Credits ran out'
  const description = isForbidden 
    ? 'Your API key is invalid or your account is restricted. Enter a valid API key to continue.'
    : 'Enter a new API key to continue. Your project, sessions, and files will be preserved.'

  useEffect(() => {
    if (open) {
      addClientLog('KeyRecoveryDialog', 'dialog opened', { hasProjectId: !!projectId })
      setNewKey('')
      setError('')
      setRecovered(false)
    }
  }, [open])

  const handleSubmit = async () => {
    if (!newKey.trim()) return
    addClientLog('KeyRecoveryDialog', 'submit clicked', { keyLength: newKey.trim().length })
    setLoading(true)
    setError('')

    try {
      addClientLog('KeyRecoveryDialog', 'calling api.rotateKey')
      await api.rotateKey(newKey.trim())
      addClientLog('KeyRecoveryDialog', 'key rotated successfully')

      await refreshCredits()
      addClientLog('KeyRecoveryDialog', 'credits refreshed')

      setRecovered(true)
      addClientLog('KeyRecoveryDialog', 'recovered state set')

      setTimeout(() => {
        onRecovered()
        onClose()
        addClientLog('KeyRecoveryDialog', 'onRecovered called, dialog closed')
      }, 1200)
    } catch (err) {
      addClientLog('KeyRecoveryDialog', 'rotation failed', { error: String(err) })
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="" width={440} hideClose>
      <div className="flex flex-col gap-5">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#ff9f0a]/10 border border-[#ff9f0a]/20 flex items-center justify-center flex-shrink-0">
            <AlertTriangle size={18} className="text-[#ff9f0a]" />
          </div>
          <div>
            <p className="text-[16px] font-semibold text-white">{title}</p>
            <p className="text-[13px] text-white/40 mt-1">{description}</p>
          </div>
        </div>

        {/* Current balance - only show if not forbidden */}
        {credits && !isForbidden && (
          <div className="bg-[#0d0d0d] rounded-[10px] border border-[rgba(255,255,255,0.08)] px-4 py-3 flex items-center gap-3">
            <CreditCard size={14} className="text-[rgba(235,235,245,0.4)] flex-shrink-0" />
            <span className="text-[13px] text-white/50">Current balance:</span>
            <span className="text-[14px] font-semibold text-[#ff9f0a] tabular-nums">${credits.balance.toFixed(2)}</span>
          </div>
        )}

        {/* New key input */}
        <div className="flex flex-col gap-2">
          <label className="text-[12px] text-[rgba(235,235,245,0.6)] font-medium">New API Key</label>
          <div className="relative">
            <input
              type={show ? 'text' : 'password'}
              value={newKey}
              onChange={e => setNewKey(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !loading && handleSubmit()}
              placeholder="vibecode_sk_..."
              className="w-full h-10 rounded-[10px] bg-[#1c1c1e] border border-[rgba(255,255,255,0.08)] text-[14px] text-white px-4 pr-11 font-mono placeholder:text-[rgba(235,235,245,0.25)] focus:outline-none focus:border-[#0a84ff]/50 transition-colors"
              autoFocus
            />
            <button onClick={() => setShow(s => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[rgba(235,235,245,0.3)] hover:text-white/50 transition-colors">
              {show ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          {error && (
            <p className="text-[12px] text-[#ff453a] flex items-center gap-1.5">
              <AlertTriangle size={12} />{error}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          {recovered ? (
            <div className="flex-1 flex items-center justify-center gap-2 h-10 rounded-[10px] bg-[#30d158]/10 border border-[#30d158]/20 text-[#30d158] font-semibold text-[14px]">
              <Check size={15} />
              Key updated! Reopening workspace...
            </div>
          ) : (
            <>
              <Button variant="ghost" onClick={onClose} className="flex-1">Cancel</Button>
              <Button variant="primary" onClick={handleSubmit} loading={loading} disabled={!newKey.trim()} className="flex-1">
                Continue with new key
              </Button>
            </>
          )}
        </div>
      </div>
    </Dialog>
  )
}
