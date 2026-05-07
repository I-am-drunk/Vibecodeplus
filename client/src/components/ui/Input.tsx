import { forwardRef, type InputHTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  icon?: React.ReactNode
}

export const Input = forwardRef<HTMLInputElement, Props>(
  ({ label, error, icon, className, ...props }, ref) => (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-[12px] text-[rgba(235,235,245,0.6)] font-medium">{label}</label>}
      <div className="relative">
        {icon && (
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[rgba(235,235,245,0.4)]">
            {icon}
          </span>
        )}
        <input
          ref={ref}
          className={cn(
            'w-full h-9 rounded-[8px] bg-[#1c1c1e] border border-[rgba(255,255,255,0.08)]',
            'text-[13px] text-white placeholder:text-[rgba(235,235,245,0.3)]',
            'focus:outline-none focus:border-[#0a84ff] transition-colors',
            icon ? 'pl-8 pr-3' : 'px-3',
            error && 'border-[#ff453a]',
            className
          )}
          {...props}
        />
      </div>
      {error && <span className="text-[11px] text-[#ff453a]">{error}</span>}
    </div>
  )
)
