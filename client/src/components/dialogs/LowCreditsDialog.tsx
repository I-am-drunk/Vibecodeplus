import { AlertTriangle, DollarSign } from 'lucide-react'
import { Dialog } from '../ui/Dialog'
import { Button } from '../ui/Button'

interface Props {
  open: boolean
  balance: number
  onConfirm: () => void
  onCancel: () => void
}

export function LowCreditsDialog({ open, balance, onConfirm, onCancel }: Props) {
  return (
    <Dialog open={open} onClose={onCancel} title="" width={420} hideClose>
      <div className="flex flex-col gap-5">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#ff9f0a]/10 border border-[#ff9f0a]/20 flex items-center justify-center flex-shrink-0">
            <AlertTriangle size={18} className="text-[#ff9f0a]" />
          </div>
          <div>
            <p className="text-[16px] font-semibold text-white">Low Credits Warning</p>
            <p className="text-[13px] text-white/40 mt-1">
              This API key has very low credits remaining
            </p>
          </div>
        </div>

        {/* Balance display */}
        <div className="bg-[#ff9f0a]/[0.05] rounded-xl border border-[#ff9f0a]/20 px-4 py-4 flex items-center justify-center gap-3">
          <DollarSign size={20} className="text-[#ff9f0a]" />
          <span className="text-[24px] font-bold text-[#ff9f0a] tabular-nums">
            ${balance.toFixed(2)}
          </span>
          <span className="text-[13px] text-[#ff9f0a]/60">remaining</span>
        </div>

        {/* Warning message */}
        <div className="text-[13px] text-white/50 leading-relaxed">
          This key has less than $1.00 in credits. You may run out of credits during use.
          <br /><br />
          Do you want to use this API key anyway?
        </div>

        {/* Actions */}
        <div className="flex gap-2.5">
          <Button variant="ghost" onClick={onCancel} className="flex-1">
            No, Cancel
          </Button>
          <Button onClick={onConfirm} className="flex-1 bg-[#ff9f0a] hover:bg-[#ff9f0a]/90">
            Yes, Use It
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
