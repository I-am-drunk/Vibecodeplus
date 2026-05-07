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
