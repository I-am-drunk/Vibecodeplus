import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { ThinkingBlock } from '../../store/chat'
import { cn } from '../../lib/utils'

// ─── Neural network SVG visualization ────────────────────────────────────────

function NeuralNet({ active }: { active: boolean }) {
  const nodes = [
    { cx: 8, cy: 6 },
    { cx: 22, cy: 6 },
    { cx: 4, cy: 16 },
    { cx: 15, cy: 14 },
    { cx: 26, cy: 16 },
    { cx: 8, cy: 26 },
    { cx: 22, cy: 26 },
  ]
  const edges = [
    [0, 2], [0, 3], [1, 3], [1, 4],
    [2, 5], [3, 5], [3, 6], [4, 6],
    [5, 6], [2, 3], [3, 4],
  ]

  return (
    <svg width="30" height="30" viewBox="0 0 30 30" className="flex-shrink-0">
      {edges.map(([a, b], i) => (
        <line
          key={`e${i}`}
          x1={nodes[a].cx} y1={nodes[a].cy}
          x2={nodes[b].cx} y2={nodes[b].cy}
          stroke={active ? '#0a84ff' : 'rgba(255,255,255,0.06)'}
          strokeWidth="0.7"
          strokeLinecap="round"
          style={active ? {
            animation: `neuralEdge 2s ease-in-out ${(i * 0.15)}s infinite`,
            strokeOpacity: 0.15,
          } : undefined}
        />
      ))}
      {nodes.map((node, i) => (
        <circle
          key={`n${i}`}
          cx={node.cx}
          cy={node.cy}
          r={1.5}
          fill={active ? '#0a84ff' : 'rgba(255,255,255,0.08)'}
          style={active ? {
            animation: `neuralPulse 1.8s ease-in-out ${(i * 0.2)}s infinite`,
          } : undefined}
        />
      ))}
    </svg>
  )
}

// ─── Thinking section ─────────────────────────────────────────────────────────

interface ThinkingSectionProps {
  blocks: ThinkingBlock[]
  isStreaming: boolean
}

export function ThinkingSection({ blocks, isStreaming }: ThinkingSectionProps) {
  const [expanded, setExpanded] = useState(false)

  if (blocks.length === 0 && !isStreaming) return null

  const hasSummary = blocks.some((b) => b.summary)

  return (
    <div
      className="rounded-xl border border-white/[0.04] bg-[#0d0d14]/60 backdrop-blur-sm transition-all duration-200"
      style={{ animation: 'fadeIn 0.3s ease' }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-white/[0.02] transition-colors rounded-xl"
      >
        <NeuralNet active={isStreaming} />
        <span className="text-[12px] font-medium text-white/35 flex-1">
          {isStreaming ? 'Thinking…' : `Thought ${blocks.length} step${blocks.length !== 1 ? 's' : ''}`}
        </span>
        {hasSummary && (
          <ChevronDown
            size={12}
            className={cn(
              'text-white/20 transition-transform duration-200',
              expanded && 'rotate-180',
            )}
          />
        )}
      </button>

      {expanded && hasSummary && (
        <div className="px-3 pb-3 space-y-1.5">
          {blocks.map((block, i) =>
            block.summary ? (
              <div
                key={block.id}
                className="flex items-start gap-2 text-[11px] text-white/30 leading-relaxed"
              >
                <span className="text-white/15 font-mono mt-px flex-shrink-0">{i + 1}.</span>
                <span>{block.summary}</span>
              </div>
            ) : null,
          )}
        </div>
      )}
    </div>
  )
}
