import { useState, useRef } from 'react'
import { Globe, RefreshCw, X, ExternalLink } from 'lucide-react'
import { useWorkspaceStore } from '../../store/workspace'
import { api } from '../../lib/api'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'

export function Preview({ projectId }: { projectId: string }) {
  const { previewUrl, previewPort, setPreview, togglePreview } = useWorkspaceStore()
  const [remotePort, setRemotePort] = useState('3000')
  const [loading, setLoading] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const start = async () => {
    setLoading(true)
    try {
      const { url, localPort } = await api.startPreview(projectId, parseInt(remotePort))
      setPreview(url, localPort)
    } catch (err) {
      alert(`Preview failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setLoading(false)
    }
  }

  const stop = async () => {
    await api.stopPreview(projectId).catch(() => {})
    setPreview(null, null)
  }

  const refresh = () => {
    if (iframeRef.current) iframeRef.current.src = iframeRef.current.src
  }

  return (
    <div className="flex flex-col h-full bg-[#0d0d0d]">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 h-9 border-b border-[rgba(255,255,255,0.07)] flex-shrink-0">
        <Globe size={13} className="text-[rgba(235,235,245,0.4)]" />
        {previewUrl ? (
          <>
            <span className="text-[12px] text-[rgba(235,235,245,0.5)] truncate flex-1">{previewUrl}</span>
            <button onClick={refresh} className="text-[rgba(235,235,245,0.4)] hover:text-white">
              <RefreshCw size={13} />
            </button>
            <button onClick={() => window.open(previewUrl, '_blank')} className="text-[rgba(235,235,245,0.4)] hover:text-white">
              <ExternalLink size={13} />
            </button>
            <button onClick={stop} className="text-[rgba(235,235,245,0.4)] hover:text-[#ff453a]">
              <X size={13} />
            </button>
          </>
        ) : (
          <>
            <span className="text-[12px] text-[rgba(235,235,245,0.4)]">Remote port:</span>
            <input
              value={remotePort}
              onChange={e => setRemotePort(e.target.value)}
              className="w-16 h-6 rounded-[5px] bg-[#1c1c1e] border border-[rgba(255,255,255,0.08)] text-[12px] text-white px-2 text-center focus:outline-none"
            />
            <Button size="sm" variant="primary" loading={loading} onClick={start}>
              Connect
            </Button>
          </>
        )}
        <button onClick={togglePreview} className="ml-auto text-[rgba(235,235,245,0.3)] hover:text-white">
          <X size={13} />
        </button>
      </div>

      {/* Content */}
      {previewUrl ? (
        <iframe ref={iframeRef} src={previewUrl} className="flex-1 w-full bg-white border-none" title="Preview" />
      ) : (
        <div className="flex-1 flex items-center justify-center text-center">
          <p className="text-[13px] text-[rgba(235,235,245,0.25)]">
            Enter the port your app is running on and click Connect
          </p>
        </div>
      )}
    </div>
  )
}
