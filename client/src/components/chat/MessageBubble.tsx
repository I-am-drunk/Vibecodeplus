import { useState } from 'react'
import type { Message } from '../../store/chat'

// ─── Code block ──────────────────────────────────────────────────────────────

function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div className="rounded-xl overflow-hidden border border-white/[0.07] my-3" style={{ background: '#0d0d10' }}>
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.06]" style={{ background: 'rgba(255,255,255,0.02)' }}>
        <span className="font-mono text-[10px] text-white/30 uppercase tracking-widest">{lang || 'code'}</span>
        <button onClick={copy}
          className="flex items-center gap-1.5 text-[11px] font-medium transition-all duration-200"
          style={{ color: copied ? '#30d158' : 'rgba(235,235,245,0.35)' }}>
          {copied ? (
            <>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              Copied
            </>
          ) : (
            <>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
              Copy
            </>
          )}
        </button>
      </div>
      <pre className="px-4 py-4 overflow-x-auto text-[13px] leading-relaxed text-white/80 font-mono">
        <code>{code}</code>
      </pre>
    </div>
  )
}

// ─── Markdown renderer ────────────────────────────────────────────────────────

function renderSpans(text: string): React.ReactNode {
  const parts = text.split(/(`[^`\n]+`|\*\*[^*]+\*\*|\*[^*\n]+\*)/g)
  return parts.map((p, i) => {
    if (p.startsWith('`') && p.endsWith('`') && p.length > 2)
      return <code key={i} className="px-1.5 py-0.5 rounded-md bg-white/[0.08] text-[#ff9f0a] font-mono text-[0.85em]">{p.slice(1, -1)}</code>
    if (p.startsWith('**') && p.endsWith('**'))
      return <strong key={i} className="font-semibold text-white">{p.slice(2, -2)}</strong>
    if (p.startsWith('*') && p.endsWith('*') && p.length > 2)
      return <em key={i} className="italic text-white/70">{p.slice(1, -1)}</em>
    return p
  })
}

function renderMarkdown(text: string): React.ReactNode {
  const parts = text.split(/(```[\s\S]*?```)/g)
  return (
    <div className="space-y-2.5">
      {parts.map((part, i) => {
        if (part.startsWith('```')) {
          const lines = part.slice(3).split('\n')
          const lang = lines[0].trim()
          const code = lines.slice(1).join('\n').replace(/```$/, '').trimEnd()
          return <CodeBlock key={i} code={code} lang={lang} />
        }
        if (!part.trim()) return null
        return part.split(/\n\n+/).map((para, pi) => {
          if (!para.trim()) return null
          const lines = para.split('\n')

          if (lines.every(l => /^\d+\.\s/.test(l.trim()) || !l.trim())) {
            return (
              <ol key={`${i}-${pi}`} className="space-y-1.5 pl-0">
                {lines.filter(l => l.trim()).map((l, li) => (
                  <li key={li} className="flex gap-3 text-[15px] leading-relaxed text-white/75">
                    <span className="text-white/25 flex-shrink-0 font-mono text-[12px] mt-0.5 w-4 text-right">{li + 1}.</span>
                    <span>{renderSpans(l.replace(/^\d+\.\s+/, ''))}</span>
                  </li>
                ))}
              </ol>
            )
          }

          if (lines.every(l => /^[-*•]\s/.test(l.trim()) || !l.trim())) {
            return (
              <ul key={`${i}-${pi}`} className="space-y-1.5 pl-0">
                {lines.filter(l => l.trim()).map((l, li) => (
                  <li key={li} className="flex gap-3 text-[15px] leading-relaxed text-white/75">
                    <span className="flex-shrink-0 mt-[9px] w-1 h-1 rounded-full bg-white/20 block" />
                    <span>{renderSpans(l.replace(/^[-*•]\s+/, ''))}</span>
                  </li>
                ))}
              </ul>
            )
          }

          if (lines.length === 1 && /^#{1,3}\s/.test(para)) {
            const level = para.match(/^(#+)/)?.[1].length ?? 1
            const content = para.replace(/^#+\s/, '')
            const cls = level === 1
              ? 'text-[17px] font-semibold text-white mt-3 mb-1'
              : level === 2
              ? 'text-[15px] font-semibold text-white/90 mt-2'
              : 'text-[14px] font-medium text-white/80 mt-1'
            return <p key={`${i}-${pi}`} className={cls}>{renderSpans(content)}</p>
          }

          return (
            <p key={`${i}-${pi}`} className="text-[15px] leading-[1.75] text-white/75 whitespace-pre-wrap break-words">
              {renderSpans(para)}
            </p>
          )
        })
      })}
    </div>
  )
}

// ─── Action button ────────────────────────────────────────────────────────────

function ActionBtn({ onClick, active, activeColor, children, title }: {
  onClick: () => void
  active?: boolean
  activeColor?: string
  children: React.ReactNode
  title?: string
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex items-center gap-2 h-8 px-3.5 rounded-xl text-[13px] font-medium transition-all duration-150 select-none"
      style={{
        background: active ? `${activeColor}18` : 'rgba(255,255,255,0.06)',
        border: `1px solid ${active ? `${activeColor}35` : 'rgba(255,255,255,0.1)'}`,
        color: active ? activeColor : 'rgba(235,235,245,0.5)',
      }}
      onMouseEnter={e => {
        if (!active) {
          (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.1)'
          ;(e.currentTarget as HTMLElement).style.color = 'rgba(235,235,245,0.85)'
          ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.16)'
        }
      }}
      onMouseLeave={e => {
        if (!active) {
          (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)'
          ;(e.currentTarget as HTMLElement).style.color = 'rgba(235,235,245,0.5)'
          ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.1)'
        }
      }}
    >
      {children}
    </button>
  )
}

// ─── Icons ────────────────────────────────────────────────────────────────────

const CopyIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
  </svg>
)

const CheckIcon = ({ color }: { color?: string }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color || 'currentColor'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
)

const RetryIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
    <path d="M3 3v5h5"/>
  </svg>
)

const ContinueIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="5 12 19 12"/><polyline points="12 5 19 12 12 19"/>
  </svg>
)

const WarnIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>
)

// ─── Main component ───────────────────────────────────────────────────────────

export function MessageBubble({ message, onRetry, onContinue }: {
  message: Message
  onRetry?: () => void
  onContinue?: () => void
}) {
  const [copied, setCopied] = useState(false)
  const [retrying, setRetrying] = useState(false)

  const copy = () => {
    navigator.clipboard.writeText(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleRetry = async () => {
    if (retrying || !onRetry) return
    setRetrying(true)
    try { await onRetry() } finally { setRetrying(false) }
  }

  // ── User message ──────────────────────────────────────────────────────────
  if (message.role === 'user') {
    return (
      <div className="flex flex-col items-end gap-1.5" style={{ animation: 'fadeIn 0.2s ease' }}>
        <div className="group relative max-w-[82%]">
          <div
            className="text-white rounded-2xl rounded-br-sm px-4 py-3 text-[15px] leading-[1.65] whitespace-pre-wrap break-words"
            style={{ background: 'linear-gradient(135deg, #0a84ff 0%, #0066d6 100%)' }}
          >
            {message.content}
          </div>

          {/* Action bar — slides up on hover */}
          <div
            className="absolute -bottom-10 right-0 flex items-center gap-1.5 transition-all duration-200 opacity-0 group-hover:opacity-100"
            style={{ transform: 'translateY(2px)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(0)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(2px)' }}
          >
            <ActionBtn onClick={copy} active={copied} activeColor="#30d158" title="Copy message">
              {copied ? <><CheckIcon color="#30d158" />Copied</> : <><CopyIcon />Copy</>}
            </ActionBtn>
            {onRetry && (
              <ActionBtn onClick={handleRetry} active={retrying} activeColor="#0a84ff" title="Retry from here">
                <RetryIcon />
                {retrying ? 'Retrying…' : 'Retry'}
              </ActionBtn>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── Assistant message ─────────────────────────────────────────────────────
  return (
    <div className="flex gap-3 group" style={{ animation: 'fadeIn 0.25s ease' }}>
      {/* Avatar */}
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
        style={{ background: 'linear-gradient(135deg, #0a84ff 0%, #6e40c9 100%)' }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M13 2L3 14h8l-1 8 10-12h-8l1-8z"/>
        </svg>
      </div>

      <div className="flex-1 min-w-0 pt-0.5">
        {/* Content */}
        {message.streaming ? (
          <div>
            {renderMarkdown(message.content)}
            <span
              className="inline-block w-[2px] h-[1.1em] ml-0.5 align-middle rounded-sm"
              style={{ background: '#0a84ff', animation: 'pulse 1s ease-in-out infinite' }}
            />
          </div>
        ) : (
          renderMarkdown(message.content)
        )}

        {/* Token count */}
        {message.inputTokens != null && (
          <p className="text-[11px] mt-2.5 font-mono" style={{ color: 'rgba(235,235,245,0.18)' }}>
            {message.inputTokens.toLocaleString()} in · {message.outputTokens?.toLocaleString()} out
          </p>
        )}

        {/* Cut-off banner */}
        {message.cutOff && !message.streaming && (
          <div
            className="mt-3 flex items-center gap-2.5 px-3 py-2 rounded-xl"
            style={{
              background: 'rgba(255,159,10,0.06)',
              border: '1px solid rgba(255,159,10,0.15)',
              animation: 'fadeIn 0.3s ease',
            }}
          >
            <span style={{ color: 'rgba(255,159,10,0.7)' }}><WarnIcon /></span>
            <span className="text-[12px] flex-1" style={{ color: 'rgba(255,159,10,0.7)' }}>Response was cut off</span>
            {onContinue && (
              <button
                onClick={onContinue}
                className="flex items-center gap-2 h-8 px-3.5 rounded-xl text-[13px] font-medium transition-all duration-150"
                style={{
                  background: 'rgba(10,132,255,0.12)',
                  border: '1px solid rgba(10,132,255,0.25)',
                  color: '#0a84ff',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(10,132,255,0.2)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(10,132,255,0.12)' }}
              >
                <ContinueIcon />
                Continue
              </button>
            )}
          </div>
        )}
      </div>

      {/* Copy button — appears on hover, right side */}
      {!message.streaming && (
        <div className="flex-shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
          <ActionBtn onClick={copy} active={copied} activeColor="#30d158" title="Copy response">
            {copied ? <CheckIcon color="#30d158" /> : <CopyIcon />}
          </ActionBtn>
        </div>
      )}
    </div>
  )
}
