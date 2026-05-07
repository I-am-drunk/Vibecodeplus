import { useState } from 'react'
import { Eye, EyeOff, CreditCard } from 'lucide-react'
import { Dialog } from '../ui/Dialog'
import { Button } from '../ui/Button'
import { useAuthStore } from '../../store/auth'
import { api } from '../../lib/api'

interface Props { open: boolean; onClose: () => void }

export function CreditsDialog({ open, onClose }: Props) {
  const { credits, user, refreshCredits } = useAuthStore()
  const [newKey, setNewKey] = useState('')
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const rotate = async () => {
    if (!newKey.trim()) return
    setLoading(true)
    setError('')
    try {
      await api.rotateKey(newKey.trim())
      await refreshCredits()
      setNewKey('')
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Credits & API Key" width={420}>
      <div className="flex flex-col gap-5">
        {credits && (
          <div className="bg-[#0d0d0d] rounded-[10px] border border-[rgba(255,255,255,0.08)] p-4">
            <div className="flex items-center gap-2 mb-3">
              <CreditCard size={14} className="text-[rgba(235,235,245,0.4)]" />
              <span className="text-[12px] text-[rgba(235,235,245,0.5)] font-medium uppercase tracking-wide">Current Balance</span>
            </div>
            <p className="text-[28px] font-semibold text-white">${credits.balance.toFixed(2)}</p>
            <p className="text-[12px] text-[rgba(235,235,245,0.4)] mt-1">${credits.used.toFixed(2)} used this period</p>
            <div className="mt-3 h-1.5 rounded-full bg-[rgba(255,255,255,0.08)] overflow-hidden">
              {credits.limit && (
                <div
                  className="h-full rounded-full bg-[#0a84ff] transition-all"
                  style={{ width: `${Math.min(100, (credits.balance / credits.limit) * 100)}%` }}
                />
              )}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <label className="text-[12px] text-[rgba(235,235,245,0.6)] font-medium">Rotate API Key</label>
          <div className="relative">
            <input
              type={show ? 'text' : 'password'}
              value={newKey}
              onChange={e => setNewKey(e.target.value)}
              placeholder="New API key..."
              className="w-full h-9 rounded-[8px] bg-[#1c1c1e] border border-[rgba(255,255,255,0.08)] text-[13px] text-white px-3 pr-10 font-mono placeholder:text-[rgba(235,235,245,0.25)] focus:outline-none focus:border-[#0a84ff]"
            />
            <button onClick={() => setShow(s => !s)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[rgba(235,235,245,0.3)]">
              {show ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          {error && <p className="text-[11px] text-[#ff453a]">{error}</p>}
        </div>

        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose} className="flex-1">Close</Button>
          <Button variant="primary" onClick={rotate} loading={loading} disabled={!newKey.trim()} className="flex-1">
            Update Key
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
