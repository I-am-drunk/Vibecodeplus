import { useEffect, useRef } from 'react'
import { useAuthStore } from '../store/auth'

interface Props {
  onClick?: () => void
}

export function CreditsBar({ onClick }: Props) {
  const { credits, setCredits } = useAuthStore()
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
    fetchCredits()
    intervalRef.current = window.setInterval(fetchCredits, 30_000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [])

  if (!credits) return null

  const isLow = credits.balance < 1
  const isCritical = credits.balance < 0.25

  const color = isCritical ? '#ff453a' : isLow ? '#ff9f0a' : 'rgba(235,235,245,0.5)'
  const bg = isCritical ? 'rgba(255,69,58,0.08)' : isLow ? 'rgba(255,159,10,0.08)' : 'rgba(255,255,255,0.05)'
  const border = isCritical ? 'rgba(255,69,58,0.2)' : isLow ? 'rgba(255,159,10,0.2)' : 'rgba(255,255,255,0.08)'

  return (
    <button
      onClick={isLow ? onClick : undefined}
      title={isLow ? 'Low credits — click to manage' : `$${credits.balance.toFixed(2)} remaining`}
      className="flex items-center gap-1.5 px-2.5 h-7 rounded-full transition-all"
      style={{
        background: bg,
        border: `1px solid ${border}`,
        color,
        cursor: isLow && onClick ? 'pointer' : 'default',
      }}
    >
      {isLow ? (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
      ) : (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
          <line x1="1" y1="10" x2="23" y2="10"/>
        </svg>
      )}
      <span className="text-[11px] font-medium tabular-nums">
        ${credits.balance.toFixed(2)}
      </span>
    </button>
  )
}
