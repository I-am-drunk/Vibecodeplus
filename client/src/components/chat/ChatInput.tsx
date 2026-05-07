import { useState, useRef, useCallback, type KeyboardEvent } from 'react'
import { ArrowUp } from 'lucide-react'
import { cn } from '../../lib/utils'

interface Props {
  onSend: (text: string) => void
  projectId: string
}

export function ChatInput({ onSend, projectId }: Props) {
  const [text, setText] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)

  const submit = useCallback(() => {
    const t = text.trim()
    if (!t) return
    onSend(t)
    setText('')
    if (ref.current) ref.current.style.height = 'auto'
  }, [text, onSend])

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() }
  }

  const handleInput = () => {
    const ta = ref.current; if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`
  }

  const canSend = !!text.trim()

  return (
    <div className={cn(
      'relative flex flex-col rounded-2xl border transition-all duration-200 bg-[#111113]',
      canSend ? 'border-[#0a84ff]/50 shadow-[0_0_0_3px_rgba(10,132,255,0.08)]' : 'border-white/[0.08] focus-within:border-white/[0.16]'
    )}>
      <textarea
        ref={ref}
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={handleKey}
        onInput={handleInput}
        placeholder="Message the agent…"
        rows={1}
        className="w-full bg-transparent resize-none text-[15px] text-white placeholder:text-white/25 focus:outline-none leading-relaxed px-5 pt-4 pb-16 max-h-[200px] overflow-y-auto"
      />
      <div className="absolute bottom-4 left-5 right-4 flex items-center justify-between pointer-events-none">
        <span className="text-[12px] text-white/20">
          {text.length > 0 ? `${text.length} chars` : 'Shift + Enter for new line'}
        </span>
        <button
          onClick={submit}
          disabled={!canSend}
          className={cn(
            'pointer-events-auto w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-150',
            canSend
              ? 'bg-[#0a84ff] text-white hover:bg-[#2a94ff] active:scale-95'
              : 'bg-white/[0.06] text-white/20 cursor-not-allowed'
          )}
        >
          <ArrowUp size={18} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  )
}
