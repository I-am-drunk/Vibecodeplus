import { Trash2, FileDown } from 'lucide-react'
import { api } from '../../lib/api'
import { useChatStore, type ChatSession } from '../../store/chat'
import { formatRelative, cn } from '../../lib/utils'
import { addClientLog } from '../../lib/serverLogs'

interface Props {
  sessions: ChatSession[]
  activeId: string | null
  onSelect: (s: ChatSession) => void
  onClose: () => void
  projectId: string
}

export function SessionList({ sessions, activeId, onSelect, onClose, projectId }: Props) {
  addClientLog('SessionList', 'rendered', { sessionCount: sessions.length, activeId, projectId })
  
  const { setSessions } = useChatStore()

  const del = async (e: React.MouseEvent, id: string) => {
    addClientLog('SessionList', 'delete clicked', { sessionId: id })
    e.stopPropagation()
    addClientLog('SessionList', 'event propagation stopped')
    
    if (!confirm('Delete this session?')) {
      addClientLog('SessionList', 'user cancelled deletion')
      return
    }
    
    addClientLog('SessionList', 'user confirmed deletion')
    addClientLog('SessionList', 'calling api.deleteSession')
    
    try {
      await api.deleteSession(id)
      addClientLog('SessionList', 'session deleted from server')
      
      addClientLog('SessionList', 'fetching updated session list')
      const { sessions: updated } = await api.listSessions(projectId)
      addClientLog('SessionList', 'received updated sessions', { count: updated.length })
      
      addClientLog('SessionList', 'calling setSessions')
      setSessions(updated)
      addClientLog('SessionList', 'sessions updated in store')
    } catch (err) {
      addClientLog('SessionList', 'error during deletion', { error: String(err), stack: err instanceof Error ? err.stack : undefined })
    }
  }

  addClientLog('SessionList', 'rendering UI')
  
  return (
    <div className="border-b border-[rgba(255,255,255,0.07)] overflow-auto max-h-64 bg-[#0a0a0a]">
      {sessions.length === 0 ? (
        <p className="text-[12px] text-[rgba(235,235,245,0.25)] text-center py-6">No saved sessions</p>
      ) : (
        sessions.map(s => {
          addClientLog('SessionList', 'rendering session', { id: s.id, title: s.title })
          return (
            <div
              key={s.id}
              onClick={() => {
                addClientLog('SessionList', 'session clicked', { id: s.id })
                addClientLog('SessionList', 'calling onSelect')
                onSelect(s)
              }}
              className={cn(
                'flex items-center gap-2 px-3 py-2 cursor-pointer group transition-colors',
                'hover:bg-[rgba(255,255,255,0.06)]',
                s.id === activeId && 'bg-[rgba(10,132,255,0.1)]'
              )}
            >
              <div className="flex-1 min-w-0">
                <p className="text-[12px] text-white truncate">{s.title || 'Untitled'}</p>
                <p className="text-[11px] text-[rgba(235,235,245,0.35)]">{formatRelative(s.updatedAt)}</p>
              </div>
              <button
                onClick={e => del(e, s.id)}
                className="opacity-0 group-hover:opacity-100 text-[rgba(235,235,245,0.3)] hover:text-[#ff453a] transition-all"
              >
                <Trash2 size={13} />
              </button>
            </div>
          )
        })
      )}
    </div>
  )
}
