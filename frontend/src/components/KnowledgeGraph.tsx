import { useEffect, useState, useCallback } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { RefreshCw, GitBranch } from 'lucide-react'
import { getGraph, type GraphNode, type GraphEdge } from '../api'

const DOC_COLORS: Record<string, string> = {
  pdf: '#3b82f6',
  xlsx: '#22c55e',
  xls: '#22c55e',
  docx: '#a855f7',
  doc: '#a855f7',
  note: '#f59e0b',
  txt: '#6b7280',
  unknown: '#6b7280',
}

function buildLayout(nodes: GraphNode[]): { x: number; y: number }[] {
  const count = nodes.length
  if (count === 0) return []
  if (count === 1) return [{ x: 300, y: 250 }]
  const cx = 400
  const cy = 300
  const r = Math.min(280, 70 * count)
  return nodes.map((_, i) => {
    const angle = (2 * Math.PI * i) / count - Math.PI / 2
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) }
  })
}

function toFlowNodes(nodes: GraphNode[]): Node[] {
  const positions = buildLayout(nodes)
  return nodes.map((n, i) => ({
    id: n.id,
    position: positions[i],
    data: { label: n.label.length > 22 ? n.label.slice(0, 20) + '…' : n.label },
    style: {
      background: DOC_COLORS[n.doc_type] ?? DOC_COLORS.unknown,
      color: '#fff',
      border: 'none',
      borderRadius: '8px',
      padding: '8px 12px',
      fontSize: '12px',
      fontWeight: 600,
      maxWidth: '160px',
      textAlign: 'center' as const,
      boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
    },
  }))
}

function toFlowEdges(edges: GraphEdge[]): Edge[] {
  return edges.map((e, i) => ({
    id: `e${i}`,
    source: e.source,
    target: e.target,
    label: `${Math.round(e.weight * 100)}%`,
    labelStyle: { fill: '#7c8db5', fontSize: 10 },
    style: { stroke: '#2e3350', strokeWidth: Math.max(1, e.weight * 3) },
    animated: e.weight > 0.7,
  }))
}

export function KnowledgeGraph() {
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [loading, setLoading] = useState(false)
  const [empty, setEmpty] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getGraph()
      if (data.nodes.length === 0) {
        setEmpty(true)
      } else {
        setEmpty(false)
        setNodes(toFlowNodes(data.nodes))
        setEdges(toFlowEdges(data.edges))
      }
    } catch {
      setEmpty(true)
    } finally {
      setLoading(false)
    }
  }, [setNodes, setEdges])

  useEffect(() => { load() }, [load])

  return (
    <div className="graph-container">
      <div className="graph-header">
        <div className="graph-title">
          <GitBranch size={16} />
          <span>Knowledge Graph</span>
        </div>
        <button className="icon-btn" onClick={load} title="Refresh graph">
          <RefreshCw size={14} className={loading ? 'spin' : ''} />
        </button>
      </div>

      <div className="graph-legend">
        {Object.entries(DOC_COLORS).filter(([k]) => k !== 'unknown').map(([type, color]) => (
          <span key={type} className="legend-item">
            <span className="legend-dot" style={{ background: color }} />
            {type}
          </span>
        ))}
      </div>

      <div className="graph-canvas">
        {empty ? (
          <div className="graph-empty">
            <GitBranch size={32} />
            <p>Upload documents to see the knowledge graph</p>
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            fitView
            colorMode="dark"
            proOptions={{ hideAttribution: true }}
          >
            <Background color="#2e3350" gap={20} />
            <Controls />
            <MiniMap
              style={{ background: '#1a1d27' }}
              nodeColor={n => (n.style?.background as string) ?? '#3b82f6'}
            />
          </ReactFlow>
        )}
      </div>
    </div>
  )
}
