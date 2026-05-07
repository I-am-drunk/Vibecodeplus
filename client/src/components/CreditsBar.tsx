import { useEffect, useRef, useState } from 'react'
import { useAuthStore } from '../store/auth'
import { api } from '../lib/api'

export function CreditsBar() {
  const { credits, setCredits } = useAuthStore()
  const [polling, setPolling] = useState(false)
  const intervalRef = useRef<number | null>(null)

  const fetchCredits = async () => {
    try {
      const res = await fetch('/api/auth/credits')
      if (!res.ok) return
      const data = await res.json()
      if (data.credits) setCredits(data.credits)
    } catch {}
  }

  useEffect(() => {
    // Poll immediately, then every 30s
    fetchCredits()
    intervalRef.current = window.setInterval(fetchCredits, 30_000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [])

  if (!credits) return null

  const isLow = credits.balance < 1
  const isCritical = credits.balance < 0.25

  return (
    <div className={`flex items-center gap-1.5 px-2.5 h-7 rounded-full border transition-colors ${
      isCritical
        ? 'bg-[#ff453a]/10 border-[#ff453a]/25 text-[#ff453a]'
        : isLow
        ? 'bg-[#ff9f0a]/10 border-[#ff9f0a]/25 text-[#ff9f0a]'
        : 'bg-white/[0.05] border-white/[0.08] text-white/60'
    }`}>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
        <line x1="1" y1="10" x2="23" y2="10"/>
      </svg>
      <span className="text-[11px] font-medium tabular-nums">
        ${credits.balance.toFixed(2)}
      </span>
    </div>
  )
}
