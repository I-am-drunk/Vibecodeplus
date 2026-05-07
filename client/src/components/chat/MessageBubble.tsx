import { useState } from 'react'
import { Copy, Check } from 'lucide-react'
import type { Message } from '../../store/chat'
import { cn } from '../../lib/utils'

function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500) }
  return (
    <div className="rounded-xl overflow-hidden border border-white/[0.08] my-4">
      <div className="flex items-center justify-between px-4 py-2.5 bg-white/[0.03] border-b border-white/[0.06]">
        <span className="font-mono text-[11px] text-white/35 uppercase tracking-wider">{lang || 'code'}</span>
        <button onClick={copy} className="flex items-center gap-1.5 text-[12px] text-white/40 hover:text-white/70 transition-colors">
          {copied ? <Check size={12} className="text-[#30d158]" /> : <Copy size={12} />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <pre className="px-4 py-4 overflow-x-auto bg-[#0d0d0d] text-[13px] leading-relaxed text-white/85 font-mono">
        <code>{code}</code>
      </pre>
    </div>
  )
}

function renderSpans(text: string): React.ReactNode {
  const parts = text.split(/(`[^`\n]+`|\*\*[^*]+\*\*|\*[^*\n]+\*)/g)
  return parts.map((p, i) => {
    if (p.startsWith('`') && p.endsWith('`') && p.length > 2)
      return <code key={i} className="px-1.5 py-0.5 rounded-md bg-white/[0.08] text-[#ff9f0a] font-mono text-[13px]">{p.slice(1, -1)}</code>
    if (p.startsWith('**') && p.endsWith('**'))
      return <strong key={i} className="font-semibold text-white">{p.slice(2, -2)}</strong>
    if (p.startsWith('*') && p.endsWith('*') && p.length > 2)
      return <em key={i} className="italic">{p.slice(1, -1)}</em>
    return p
  })
}

function renderMarkdown(text: string): React.ReactNode {
  const parts = text.split(/(```[\s\S]*?```)/g)
  return (
    <div className="space-y-3">
      {parts.map((part, i) => {
        if (part.startsWith('```')) {
          const lines = part.slice(3).split('\n')
          const lang = lines[0].trim()
          const code = lines.slice(1).join('\n').replace(/```$/, '').trimEnd()
          return <CodeBlock key={i} code={code} lang={lang} />
        }
        if (!part.trim()) return null
        const paragraphs = part.split(/\n\n+/)
        return paragraphs.map((para, pi) => {
          if (!para.trim()) return null
          const lines = para.split('\n')
          
          // Numbered list
          if (lines.every(l => /^\d+\.\s/.test(l.trim()) || !l.trim())) {
            return (
              <ol key={`${i}-${pi}`} className="space-y-2 pl-0">
                {lines.filter(l => l.trim()).map((l, li) => (
                  <li key={li} className="flex gap-3 text-[15px] leading-relaxed text-white/80">
                    <span className="text-white/30 flex-shrink-0 font-mono text-[13px] mt-0.5">{li + 1}.</span>
                    <span>{renderSpans(l.replace(/^\d+\.\s+/, ''))}</span>
                  </li>
                ))}
              </ol>
            )
          }
          
          // Bullet list
          if (lines.every(l => /^[-*•]\s/.test(l.trim()) || !l.trim())) {
            return (
              <ul key={`${i}-${pi}`} className="space-y-2 pl-0">
                {lines.filter(l => l.trim()).map((l, li) => (
                  <li key={li} className="flex gap-3 text-[15px] leading-relaxed text-white/80">
                    <span className="text-white/25 flex-shrink-0 mt-2 w-1 h-1 rounded-full bg-white/25 block" />
                    <span>{renderSpans(l.replace(/^[-*•]\s+/, ''))}</span>
                  </li>
                ))}
              </ul>
            )
          }
          
          // Heading
          if (lines.length === 1 && /^#{1,3}\s/.test(para)) {
            const level = para.match(/^(#+)/)?.[1].length ?? 1
            const content = para.replace(/^#+\s/, '')
            const cls = level === 1 ? 'text-[17px] font-semibold text-white mt-2' : level === 2 ? 'text-[15px] font-semibold text-white/90 mt-1' : 'text-[14px] font-medium text-white/80'
            return <p key={`${i}-${pi}`} className={cls}>{renderSpans(content)}</p>
          }
          
          return (
            <p key={`${i}-${pi}`} className="text-[15px] leading-[1.7] text-white/80 whitespace-pre-wrap break-words">
              {renderSpans(para)}
            </p>
          )
        })
      })}
    </div>
  )
}

export function MessageBubble({ message, onRetry, onContinue }: { 
  message: Message
  onRetry?: () => void
  onContinue?: () => void
}) {
  const [copied, setCopied] = useState(false)
  const isUser = message.role === 'user'

  const copy = () => { navigator.clipboard.writeText(message.content); setCopied(true); setTimeout(() => setCopied(false), 1500) }

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="group relative max-w-[80%]">
          <div className="bg-[#0a84ff] text-white rounded-2xl rounded-br-md px-4 py-3 text-[15px] leading-[1.6] whitespace-pre-wrap break-words">
            {message.content}
          </div>
          <div className="absolute -bottom-2 -left-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
            <button onClick={copy}
              className="w-7 h-7 rounded-lg bg-[#1c1c1e] border border-white/[0.12] flex items-center justify-center">
              {copied ? <Check size={11} className="text-[#30d158]" /> : <Copy size={11} className="text-white/50" />}
            </button>
            {onRetry && (
              <button onClick={onRetry} title="Retry"
                className="w-7 h-7 rounded-lg bg-[#1c1c1e] border border-white/[0.12] flex items-center justify-center hover:border-[#0a84ff]/40 transition-colors">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-white/50" strokeWidth="2.5">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                  <path d="M3 3v5h5"/>
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-3 group">
      <div className="w-8 h-8 rounded-lg bg-[#0a84ff] flex items-center justify-center flex-shrink-0 mt-0.5">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M13 2L3 14h8l-1 8 10-12h-8l1-8z"/>
        </svg>
      </div>

      <div className="flex-1 min-w-0 pt-0.5">
        {message.streaming ? (
          <div>
            {renderMarkdown(message.content)}
            <span className="inline-block w-0.5 h-4 bg-[#0a84ff] ml-1 animate-pulse align-middle" />
          </div>
        ) : (
          renderMarkdown(message.content)
        )}

        {message.inputTokens && (
          <p className="text-[11px] text-white/20 mt-3 font-mono">
            {message.inputTokens}↑ {message.outputTokens}↓
          </p>
        )}

        {/* Cut-off indicator + actions */}
        {message.cutOff && !message.streaming && (
          <div className="mt-3 flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-[12px] text-[#ff9f0a]/70">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <span>Response cut off</span>
            </div>
            {onContinue && (
              <button onClick={onContinue}
                className="flex items-center gap-1.5 h-6 px-2.5 rounded-md bg-[#0a84ff]/10 border border-[#0a84ff]/20 text-[12px] text-[#0a84ff] hover:bg-[#0a84ff]/15 transition-colors font-medium">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="5 12 19 12"/><polyline points="12 5 19 12 12 19"/>
                </svg>
                Continue
              </button>
            )}
          </div>
        )}
      </div>

      {!message.streaming && (
        <button onClick={copy}
          className="opacity-0 group-hover:opacity-100 w-8 h-8 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] flex items-center justify-center transition-all flex-shrink-0 mt-0.5">
          {copied ? <Check size={13} className="text-[#30d158]" /> : <Copy size={13} className="text-white/40" />}
        </button>
      )}
    </div>
  )
}
