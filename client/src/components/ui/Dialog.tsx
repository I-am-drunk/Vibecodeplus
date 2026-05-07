import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { Button } from './Button'

interface Props {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: ReactNode
  width?: number
  hideClose?: boolean
}

export function Dialog({ open, onClose, title, description, children, width = 480 }: Props) {
  const backdropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    if (open) document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === backdropRef.current) onClose() }}
    >
      <div
        className="relative rounded-[16px] bg-[#1c1c1e] border border-[rgba(255,255,255,0.1)] shadow-2xl animate-slide-in overflow-hidden"
        style={{ width, maxWidth: 'calc(100vw - 32px)' }}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-5 pb-4 border-b border-[rgba(255,255,255,0.07)]">
          <div>
            <h2 className="text-[15px] font-semibold text-white">{title}</h2>
            {description && <p className="text-[12px] text-[rgba(235,235,245,0.5)] mt-0.5">{description}</p>}
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose} className="-mr-1 -mt-1">
            <X size={15} />
          </Button>
        </div>
        {/* Body */}
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}
