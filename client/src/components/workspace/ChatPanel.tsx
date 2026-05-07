import { useEffect, useRef, useState } from 'react'
import { api } from '../../lib/api'
import { useChatStore } from '../../store/chat'
import { useChat } from '../../hooks/useChat'
import { MessageBubble } from '../chat/MessageBubble'
import { ChatInput } from '../chat/ChatInput'
import { ToolCallCard } from '../chat/ToolCallCard'
import { SessionList } from './SessionList'
import { CreditsDialog } from '../dialogs/CreditsDialog'
import { KeyRecoveryDialog } from '../dialogs/KeyRecoveryDialog'
import { History, Plus, Copy, Check, AlertTriangle } from 'lucide-react'
import { cn } from '../../lib/utils'
import { addClientLog } from '../../lib/serverLogs'

export function ChatPanel({ projectId, disableInput = false }: { projectId: string; disableInput?: boolean }) {
  const {
    sessions, messages, streamingText, isStreaming, activeSessionId,
    creditsExhausted, setCreditsExhausted, setSessions, setMessages, setActiveSession, toolCalls
  } = useChatStore()
  const { sendMessage, loadSession } = useChat(projectId)
  const [showSessions, setShowSessions] = useState(false)
  const [showCredits, setShowCredits] = useState(false)
  const [showKeyRecovery, setShowKeyRecovery] = useState(false)
  const [creditsDismissed, setCreditsDismissed] = useState(false)
  const [copied, setCopied] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    addClientLog('ChatPanel', 'useEffect triggered', { projectId })
    addClientLog('ChatPanel', 'calling api.listSessions')
    
    api.listSessions(projectId).then(({ sessions }) => {
      addClientLog('ChatPanel', 'api.listSessions resolved', { count: sessions.length })
      
      sessions.forEach((s, idx) => {
        addClientLog('ChatPanel', `session ${idx}`, {
          id: s.id,
          title: s.title,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
          messageCount: s.messageCount,
          keys: Object.keys(s)
        })
      })
      
      addClientLog('ChatPanel', 'calling setSessions')
      setSessions(sessions)
      addClientLog('ChatPanel', 'setSessions completed')
    }).catch(err => {
      addClientLog('ChatPanel', 'api.listSessions failed', { error: String(err), stack: err instanceof Error ? err.stack : undefined })
    })
  }, [projectId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, streamingText])

  const activeSession = sessions.find(s => s.id === activeSessionId)
  const sessionTitle = activeSession?.title

  const startNew = () => { setMessages([]); setActiveSession(null) }

  const copyTranscript = () => {
    if (!messages.length) return
    navigator.clipboard.writeText(messages.map(m => `${m.role === 'user' ? 'You' : 'Agent'}: ${m.content}`).join('\n\n'))
    setCopied(true); setTimeout(() => setCopied(false), 1500)
  }

  const isEmpty = messages.length === 0 && !isStreaming

  return (
    <div className="flex flex-col h-full bg-[#080809]">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 h-12 border-b border-white/[0.06] flex-shrink-0 bg-[#0a0a0a]">
        <button onClick={() => setShowSessions(s => !s)}
          className={cn('flex items-center gap-2 h-8 px-3 rounded-lg text-[13px] font-medium transition-all',
            showSessions ? 'bg-white/[0.08] text-white' : 'text-white/40 hover:text-white/70 hover:bg-white/[0.04]')}>
          <History size={14} />
          <span>History</span>
        </button>

        <div className="flex-1 min-w-0 flex justify-center">
          {sessionTitle && (
            <span className="text-[12px] text-white/25 truncate max-w-[240px]">{sessionTitle}</span>
          )}
        </div>

        {messages.length > 0 && (
          <button onClick={copyTranscript}
            className="flex items-center gap-2 h-8 px-3 rounded-lg text-[13px] font-medium text-white/40 hover:text-white/70 hover:bg-white/[0.04] transition-all">
            {copied ? <Check size={14} className="text-[#30d158]" /> : <Copy size={14} />}
            <span className="hidden sm:inline">{copied ? 'Copied' : 'Copy'}</span>
          </button>
        )}

        <button onClick={startNew}
          className="flex items-center gap-2 h-8 px-3 rounded-lg text-[13px] font-medium text-white/40 hover:text-white/70 hover:bg-white/[0.04] transition-all">
          <Plus size={14} />
          <span>New</span>
        </button>
      </div>

      {showSessions && (
        <SessionList sessions={sessions} activeId={activeSessionId}
          onSelect={s => { loadSession(s.id); setShowSessions(false) }}
          onClose={() => setShowSessions(false)} projectId={projectId} />
      )}

      {creditsExhausted && !creditsDismissed && (
        <div className="flex items-center gap-2.5 px-4 py-3 bg-[#ff453a]/[0.08] border-b border-[#ff453a]/20 flex-shrink-0">
          <AlertTriangle size={14} className="text-[#ff453a] flex-shrink-0" />
          <span className="text-[13px] text-[#ff453a] flex-1">Credits exhausted.</span>
          <button onClick={() => setShowKeyRecovery(true)} className="text-[12px] text-[#ff453a] underline font-medium hover:text-[#ff6b5a] transition-colors">Use new key</button>
          <button onClick={() => setCreditsDismissed(true)} className="text-[12px] text-[#ff453a]/60 hover:text-[#ff453a] transition-colors">✕</button>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {isEmpty ? (
          <div className="h-full flex items-center justify-center px-6">
            <div className="flex flex-col items-center gap-6 max-w-md w-full">
              <div className="text-center">
                <p className="text-[17px] font-semibold text-white/80 mb-2">How can I help?</p>
                <p className="text-[14px] text-white/35 leading-relaxed">
                  Ask me to build features, fix bugs, or explain code.
                </p>
              </div>

              <div className="flex flex-col gap-2 w-full">
                {[
                  'Build a landing page',
                  'Create a REST API',
                  'Fix TypeScript errors',
                  'Add authentication',
                ].map(s => (
                  <button key={s} onClick={() => sendMessage(s)}
                    className="px-4 py-3 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.08] hover:border-white/[0.14] rounded-xl transition-all text-[14px] text-white/45 hover:text-white/75 text-left">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="px-6 py-6 flex flex-col gap-6 max-w-4xl mx-auto w-full">
            {messages.map(msg => <MessageBubble key={msg.id} message={msg} />)}
            {toolCalls.map(tc => <ToolCallCard key={tc.id} {...tc} />)}
            {isStreaming && streamingText && (
              <MessageBubble message={{ id: '__streaming', role: 'assistant', content: streamingText, createdAt: '', streaming: true }} />
            )}
            {isStreaming && !streamingText && (
              <div className="flex gap-3 items-center">
                <div className="w-8 h-8 rounded-lg bg-[#0a84ff] flex items-center justify-center flex-shrink-0">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M13 2L3 14h8l-1 8 10-12h-8l1-8z"/>
                  </svg>
                </div>
                <div className="flex gap-1.5">
                  {[0,1,2].map(i => (
                    <div key={i} className="w-1.5 h-1.5 rounded-full bg-white/30"
                      style={{ animation: `pulse 1.2s ease-in-out ${i * 0.15}s infinite` }} />
                  ))}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="flex-shrink-0 p-4 border-t border-white/[0.06] bg-[#0a0a0a]">
        <div className="max-w-4xl mx-auto">
          {disableInput ? (
              <div className="flex items-center justify-center h-12 rounded-2xl border border-[#ff9f0a]/20 bg-[#ff9f0a]/[0.04] text-[13px] text-[#ff9f0a]/60">
                Migrate project to current API key to send messages
              </div>
            ) : (
              <ChatInput onSend={sendMessage} projectId={projectId} />
            )}
        </div>
      </div>

      <CreditsDialog open={showCredits} onClose={() => { setShowCredits(false); setCreditsExhausted(false) }} />
      <KeyRecoveryDialog
        open={showKeyRecovery}
        onClose={() => setShowKeyRecovery(false)}
        onRecovered={() => {
          setShowKeyRecovery(false)
          setCreditsExhausted(false)
          addClientLog('ChatPanel', 'key recovered, sessions will be re-fetched')
          api.listSessions(projectId).then(({ sessions }) => setSessions(sessions)).catch(() => {})
        }}
        projectId={projectId}
      />
    </div>
  )
}
