import { useEffect, useRef, useState, type ReactNode } from 'react'

export type MenuItem = {
  label: string
  icon?: ReactNode
  onClick: () => void | Promise<void>
  destructive?: boolean
  separator?: never
  disabled?: boolean
} | {
  separator: true
  label?: never
  icon?: never
  onClick?: never
  destructive?: never
  disabled?: never
}

interface Props {
  items: MenuItem[]
  children: ReactNode
}

export function ContextMenu({ items, children }: Props) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = () => setPos(null)
    if (pos) {
      document.addEventListener('click', handler)
      document.addEventListener('contextmenu', handler)
    }
    return () => {
      document.removeEventListener('click', handler)
      document.removeEventListener('contextmenu', handler)
    }
  }, [!!pos])

  return (
    <>
      <div onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        setPos({ x: e.clientX, y: e.clientY })
      }}>
        {children}
      </div>

      {pos && (
        <div
          ref={menuRef}
          className="fixed z-[100] rounded-[10px] bg-[#2c2c2e] border border-[rgba(255,255,255,0.1)] shadow-xl py-1 min-w-[160px] animate-fade-in"
          style={{ left: pos.x, top: pos.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {items.map((item, i) => (
            item.separator ? (
              <div key={i} className="h-px bg-[rgba(255,255,255,0.07)] my-1" />
            ) : (
              <button
                key={i}
                disabled={item.disabled}
                onClick={() => { item.onClick(); setPos(null) }}
                className={`flex items-center gap-2.5 w-full px-3 py-1.5 text-[13px] transition-colors
                  ${item.destructive ? 'text-[#ff453a] hover:bg-[rgba(255,69,58,0.1)]' : 'text-white hover:bg-[rgba(255,255,255,0.07)]'}
                  disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                {item.icon && <span className="w-4 h-4 flex items-center justify-center">{item.icon}</span>}
                {item.label}
              </button>
            )
          ))}
        </div>
      )}
    </>
  )
}
