import { cn } from '../../lib/utils'

const styles = {
  default: 'bg-[rgba(255,255,255,0.08)] text-[rgba(235,235,245,0.7)]',
  blue: 'bg-[rgba(10,132,255,0.15)] text-[#409cff]',
  green: 'bg-[rgba(48,209,88,0.15)] text-[#30d158]',
  yellow: 'bg-[rgba(255,159,10,0.15)] text-[#ff9f0a]',
  red: 'bg-[rgba(255,69,58,0.15)] text-[#ff453a]',
}

interface Props {
  children: React.ReactNode
  variant?: keyof typeof styles
  className?: string
}

export function Badge({ children, variant = 'default', className }: Props) {
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium', styles[variant], className)}>
      {children}
    </span>
  )
}
