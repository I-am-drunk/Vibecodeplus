import { Dialog } from '../ui/Dialog'

interface Props {
  open: boolean
  balance: number
  onConfirm: () => void
  onCancel: () => void
}

export function LowCreditsDialog({ open, balance, onConfirm, onCancel }: Props) {
  return (
    <Dialog open={open} onClose={onCancel} title="" width={400} hideClose>
      <div className="flex flex-col gap-0 -m-5">
        {/* Hero */}
        <div className="relative overflow-hidden px-6 pt-7 pb-6"
          style={{ background: 'linear-gradient(135deg, rgba(255,159,10,0.08) 0%, rgba(255,159,10,0.02) 100%)' }}>
          <div className="absolute -top-6 -right-6 w-28 h-28 rounded-full opacity-15 blur-2xl" style={{ background: '#ff9f0a' }} />
          <div className="relative text-center">
            {/* Big balance display */}
            <div className="inline-flex flex-col items-center gap-1 px-6 py-4 rounded-2xl mb-4"
              style={{ background: 'rgba(255,159,10,0.08)', border: '1px solid rgba(255,159,10,0.18)' }}>
              <span className="text-[11px] font-medium uppercase tracking-widest" style={{ color: 'rgba(255,159,10,0.5)' }}>Remaining Balance</span>
              <span className="text-[36px] font-bold tabular-nums leading-none" style={{ color: '#ff9f0a' }}>
                ${balance.toFixed(2)}
              </span>
            </div>
            <p className="text-[15px] font-semibold text-white">Low Credits</p>
            <p className="text-[13px] mt-1.5 leading-relaxed" style={{ color: 'rgba(235,235,245,0.4)' }}>
              Less than $1.00 remaining. You may run out mid-session.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="px-6 py-5 flex flex-col gap-3">
          <button onClick={onConfirm}
            className="w-full h-11 rounded-xl text-[14px] font-semibold transition-all"
            style={{ background: 'linear-gradient(135deg, #ff9f0a 0%, #e08800 100%)', color: 'white', boxShadow: '0 4px 16px rgba(255,159,10,0.2)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '0.9' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '1' }}>
            Use this key anyway
          </button>
          <button onClick={onCancel}
            className="w-full h-11 rounded-xl text-[14px] font-medium transition-all"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(235,235,245,0.5)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.09)'; (e.currentTarget as HTMLElement).style.color = 'rgba(235,235,245,0.8)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)'; (e.currentTarget as HTMLElement).style.color = 'rgba(235,235,245,0.5)' }}>
            Enter a different key
          </button>
        </div>
      </div>
    </Dialog>
  )
}
