import { cn } from '../../lib/utils'

interface Props {
  checked: boolean
  onChange: (v: boolean) => void
  label?: string
  size?: 'sm' | 'md'
}

export function Toggle({ checked, onChange, label, size = 'md' }: Props) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer group">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative flex-shrink-0 rounded-full transition-colors duration-200',
          size === 'sm' ? 'w-8 h-4' : 'w-10 h-6',
          checked ? 'bg-[#0a84ff]' : 'bg-[rgba(255,255,255,0.12)]'
        )}
      >
        <span className={cn(
          'absolute top-0.5 rounded-full bg-white shadow-sm transition-transform duration-200',
          size === 'sm' ? 'w-3 h-3 left-0.5' : 'w-5 h-5 left-0.5',
          checked && (size === 'sm' ? 'translate-x-4' : 'translate-x-4')
        )} />
      </button>
      {label && <span className="text-[13px] text-[rgba(235,235,245,0.7)] group-hover:text-white transition-colors">{label}</span>}
    </label>
  )
}
