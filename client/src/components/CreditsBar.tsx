import { useAuthStore } from '../store/auth'
import { CreditCard } from 'lucide-react'

export function CreditsBar() {
  const { credits } = useAuthStore()
  if (!credits) return null

  const pct = credits.limit ? Math.max(0, Math.min(100, (credits.balance / credits.limit) * 100)) : null
  const isLow = credits.balance < 2

  return (
    <div className="flex items-center gap-1.5 px-2 h-7 rounded-full bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.08)]">
      <CreditCard size={11} className={isLow ? 'text-[#ff9f0a]' : 'text-[rgba(235,235,245,0.4)]'} />
      <span className={`text-[11px] font-medium ${isLow ? 'text-[#ff9f0a]' : 'text-[rgba(235,235,245,0.6)]'}`}>
        ${credits.balance.toFixed(2)}
      </span>
    </div>
  )
}
