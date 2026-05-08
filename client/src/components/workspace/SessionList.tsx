import { Trash2 } from 'lucide-react'
import { api } from '../../lib/api'
import { useChatStore, type ChatSession } from '../../store/chat'
import { formatRelative, cn } from '../../lib/utils'

interface Props {
  sessions: ChatSession[]
  activeId: string | null
  onSelect: (s: ChatSession) => void
  onClose: () => void
  projectId: string
}

export function SessionList({ sessions, activeId, onSelect, projectId }: Props) {
  const { setSessions } = useChatStore()

  const del = async (event: React.MouseEvent, id: string) => {
    event.stopPropagation()
    if (!confirm('Delete this session?')) return

    await api.deleteSession(id)
    const { sessions: updated } = await api.listSessions(projectId)
    setSessions(updated)
  }

  return (
    <div className="border-b border-[rgba(255,255,255,0.07)] overflow-auto max-h-64 bg-[#0a0a0a]">
      {sessions.length === 0 ? (
        <p className="text-[12px] text-[rgba(235,235,245,0.25)] text-center py-6">No saved sessions</p>
      ) : (
        sessions.map((session) => (
          <div
            key={session.id}
            onClick={() => onSelect(session)}
            className={cn(
              'flex items-center gap-2 px-3 py-2 cursor-pointer group transition-colors',
              'hover:bg-[rgba(255,255,255,0.06)]',
              session.id === activeId && 'bg-[rgba(10,132,255,0.1)]',
            )}
          >
            <div className="flex-1 min-w-0">
              <p className="text-[12px] text-white truncate">{session.title || 'Untitled'}</p>
              <p className="text-[11px] text-[rgba(235,235,245,0.35)]">{formatRelative(session.updatedAt)}</p>
            </div>
            <button
              onClick={(event) => {
                void del(event, session.id)
              }}
              className="opacity-0 group-hover:opacity-100 text-[rgba(235,235,245,0.3)] hover:text-[#ff453a] transition-all"
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))
      )}
    </div>
  )
}
