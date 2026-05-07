import { useEffect } from 'react'
import { getProjectWS } from '../lib/ws'
import { useChatStore } from '../store/chat'
import { useAuthStore } from '../store/auth'
import { useWorkspaceStore } from '../store/workspace'

export function useProjectEvents(projectId: string | null) {
  const { appendStreamText, finalizeStream, setStreaming, setCreditsExhausted } = useChatStore()
  const { setCredits } = useAuthStore()
  const { notifyFileChanged } = useWorkspaceStore()

  useEffect(() => {
    if (!projectId) return
    const ws = getProjectWS(projectId)
    let accumulated = ''

    const handleMessage = (e: MessageEvent) => {
      try {
        const event = JSON.parse(e.data)
        
        switch (event.type) {
          case 'chat:stream:start':
            accumulated = ''
            setStreaming(true)
            break
          case 'chat:event':
            if (event.event?.type === 'text' && event.event.text) {
              accumulated += event.event.text
              appendStreamText(event.event.text)
            } else if (event.event?.type === 'tool_use') {
              // Log tool use for visualization
              console.log('[tool_use]', event.event.name, event.event.input)
            } else if (event.event?.type === 'tool_result') {
              // Log tool result
              console.log('[tool_result]', event.event.tool_use_id, event.event.content?.substring(0, 200))
            }
            break
          case 'chat:stream:end':
            finalizeStream(accumulated)
            accumulated = ''
            notifyFileChanged()
            break
          case 'credits:exhausted':
            setCreditsExhausted(true)
            break
          case 'credits:update':
            if (event.credits) setCredits(event.credits)
            break
          case 'file:changed':
            notifyFileChanged()
            break
        }
      } catch (err) {
        console.warn('[ws] failed to parse message:', err)
      }
    }

    ws.addEventListener('message', handleMessage)
    return () => { ws.removeEventListener('message', handleMessage) }
  }, [projectId])
}
