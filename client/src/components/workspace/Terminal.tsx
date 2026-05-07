import { useEffect, useRef } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { X } from 'lucide-react'
import { useWorkspaceStore } from '../../store/workspace'
import { terminalWSUrl } from '../../lib/ws'
import '@xterm/xterm/css/xterm.css'

export function TerminalPanel({ projectId }: { projectId: string }) {
  const { toggleTerminal } = useWorkspaceStore()
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<XTerm | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const fitRef = useRef<FitAddon | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const term = new XTerm({
      theme: {
        background: '#0a0a0a',
        foreground: '#eeeef0',
        cursor: '#0a84ff',
        selectionBackground: '#0a84ff30',
        black: '#1c1c1e',
        red: '#ff453a',
        green: '#30d158',
        yellow: '#ff9f0a',
        blue: '#409cff',
        magenta: '#bf5af2',
        cyan: '#5ac8fa',
        white: '#eeeef0',
        brightBlack: '#636366',
        brightBlue: '#64d2ff',
      },
      fontSize: 13,
      fontFamily: "'SF Mono', 'Menlo', 'Monaco', monospace",
      cursorBlink: true,
      cursorStyle: 'bar',
      scrollback: 5000,
      lineHeight: 1.4,
    })

    const fit = new FitAddon()
    fitRef.current = fit
    term.loadAddon(fit)
    term.open(containerRef.current)
    fit.fit()
    termRef.current = term

    const ws = new WebSocket(terminalWSUrl(projectId))
    wsRef.current = ws

    ws.binaryType = 'arraybuffer'

    ws.onopen = () => {
      const { rows, cols } = term
      ws.send(JSON.stringify({ type: 'terminal:resize', rows, cols }))
    }

    ws.onmessage = (e) => {
      if (e.data instanceof ArrayBuffer) {
        term.write(new Uint8Array(e.data))
      } else {
        term.write(e.data)
      }
    }

    ws.onclose = () => term.write('\r\n\x1b[31m[disconnected]\x1b[0m\r\n')

    term.onData(data => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'terminal:input', data }))
      }
    })

    term.onResize(({ rows, cols }) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'terminal:resize', rows, cols }))
      }
    })

    const resizeObserver = new ResizeObserver(() => fit.fit())
    resizeObserver.observe(containerRef.current)

    return () => {
      resizeObserver.disconnect()
      term.dispose()
      ws.close()
    }
  }, [projectId])

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a]">
      <div className="flex items-center px-3 h-8 border-b border-[rgba(255,255,255,0.07)] flex-shrink-0">
        <span className="text-[11px] font-semibold text-[rgba(235,235,245,0.4)] uppercase tracking-wider flex-1">Terminal</span>
        <button onClick={toggleTerminal} className="text-[rgba(235,235,245,0.3)] hover:text-white">
          <X size={13} />
        </button>
      </div>
      <div ref={containerRef} className="flex-1 p-2 overflow-hidden" />
    </div>
  )
}
