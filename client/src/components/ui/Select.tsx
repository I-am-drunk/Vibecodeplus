import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import { cn } from '../../lib/utils'

interface Option { value: string; label: string; description?: string }

interface Props {
  value: string
  onChange: (value: string) => void
  options: Option[]
  placeholder?: string
  className?: string
  size?: 'sm' | 'md'
}

export function Select({ value, onChange, options, placeholder, className, size = 'md' }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const selected = options.find(o => o.value === value)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={cn(
          'flex items-center gap-2 rounded-[8px] bg-[#1c1c1e] border border-[rgba(255,255,255,0.08)]',
          'text-[13px] text-white hover:border-[rgba(255,255,255,0.18)] transition-colors w-full',
          size === 'sm' ? 'h-7 px-2.5' : 'h-9 px-3'
        )}
      >
        <span className="flex-1 text-left truncate">{selected?.label ?? placeholder ?? 'Select...'}</span>
        <ChevronDown size={13} className={cn('text-[rgba(235,235,245,0.4)] transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute z-50 top-full mt-1 w-full min-w-[180px] rounded-[10px] bg-[#2c2c2e] border border-[rgba(255,255,255,0.1)] shadow-xl overflow-hidden">
          {options.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false) }}
              className="flex items-center gap-2 w-full px-3 py-2 text-[13px] text-white hover:bg-[rgba(255,255,255,0.07)] text-left transition-colors"
            >
              <Check size={13} className={cn('text-[#0a84ff] flex-shrink-0', opt.value !== value && 'opacity-0')} />
              <div>
                <div>{opt.label}</div>
                {opt.description && <div className="text-[11px] text-[rgba(235,235,245,0.4)]">{opt.description}</div>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
