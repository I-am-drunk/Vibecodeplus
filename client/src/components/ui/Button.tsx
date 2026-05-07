import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

const variants = {
  primary: 'bg-[#0a84ff] hover:bg-[#409cff] text-white',
  secondary: 'bg-[rgba(255,255,255,0.08)] hover:bg-[rgba(255,255,255,0.13)] text-white',
  ghost: 'bg-transparent hover:bg-[rgba(255,255,255,0.08)] text-[rgba(235,235,245,0.7)]',
  destructive: 'bg-[rgba(255,69,58,0.15)] hover:bg-[rgba(255,69,58,0.25)] text-[#ff453a]',
  outline: 'border border-[rgba(255,255,255,0.15)] bg-transparent hover:bg-[rgba(255,255,255,0.06)] text-white',
}

const sizes = {
  sm: 'h-7 px-3 text-[12px]',
  md: 'h-8 px-4 text-[13px]',
  lg: 'h-10 px-5 text-[14px]',
  icon: 'h-8 w-8 p-0',
  'icon-sm': 'h-7 w-7 p-0',
}

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variants
  size?: keyof typeof sizes
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, Props>(
  ({ variant = 'secondary', size = 'md', loading, disabled, className, children, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-[8px] font-medium',
        'transition-colors duration-100 cursor-pointer select-none',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {loading ? <Spinner size={14} /> : children}
    </button>
  )
)

function Spinner({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className="animate-spin" style={{ animation: 'spin 0.7s linear infinite' }}>
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
        strokeDasharray="28" strokeDashoffset="10" />
    </svg>
  )
}
