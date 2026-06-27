import { useEffect, useRef, useState, useCallback } from 'react'
import * as d3 from 'd3'
import { RefreshCw, GitBranch, Search, X } from 'lucide-react'
import { getGraph, refreshGraph, type GraphNode, type GraphEdge } from '../api'

const CONCEPT_COLORS: Record<string, string> = {
  component: '#3b82f6',
  problem:   '#ef4444',
  cause:     '#f97316',
  symptom:   '#eab308',
  solution:  '#22c55e',
  parameter: '#a855f7',
}

const FALLBACK_COLOR = '#6b7280'

interface SimNode extends d3.SimulationNodeDatum {
  id: string
  label: string
  type: string
  degree: number
  radius: number
  color: string
}

interface SimEdge extends d3.SimulationLinkDatum<SimNode> {
  weight: number
  label?: string
}

function getNodeColor(type: string): string {
  return CONCEPT_COLORS[type] ?? FALLBACK_COLOR
}

function lighten(hex: string, amount: number): string {
  const num = parseInt(hex.replace('#', ''), 16)
  const r = Math.min(255, (num >> 16) + amount)
  const g = Math.min(255, ((num >> 8) & 0xff) + amount)
  const b = Math.min(255, (num & 0xff) + amount)
  return `rgb(${r},${g},${b})`
}

export function KnowledgeGraph() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const simRef = useRef<d3.Simulation<SimNode, SimEdge> | null>(null)
  const transformRef = useRef<d3.ZoomTransform>(d3.zoomIdentity)
  const hoveredRef = useRef<SimNode | null>(null)
  const selectedRef = useRef<SimNode | null>(null)
  const nodesRef = useRef<SimNode[]>([])
  const edgesRef = useRef<SimEdge[]>([])
  const animFrameRef = useRef<number>(0)

  const [loading, setLoading] = useState(false)
  const [empty, setEmpty] = useState(false)
  const [search, setSearch] = useState('')
  const [nodeCount, setNodeCount] = useState(0)
  const [edgeCount, setEdgeCount] = useState(0)
  const [selectedInfo, setSelectedInfo] = useState<SimNode | null>(null)
  const [selectedEdges, setSelectedEdges] = useState<SimEdge[]>([])

  const draw = useCallback((searchQuery: string) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { width, height } = canvas
    ctx.clearRect(0, 0, width, height)

    const t = transformRef.current
    ctx.save()
    ctx.translate(t.x, t.y)
    ctx.scale(t.k, t.k)

    const nodes = nodesRef.current
    const edges = edgesRef.current
    const hovered = hoveredRef.current
    const selected = selectedRef.current
    const query = searchQuery.toLowerCase()

    const neighborIds = new Set<string>()
    const neighborEdges = new Set<SimEdge>()
    if (selected) {
      neighborIds.add(selected.id)
      for (const e of edges) {
        const s = e.source as SimNode
        const tgt = e.target as SimNode
        if (s.id === selected.id) { neighborIds.add(tgt.id); neighborEdges.add(e) }
        if (tgt.id === selected.id) { neighborIds.add(s.id); neighborEdges.add(e) }
      }
    }

    const dimAll = selected !== null

    // Draw edges
    for (const e of edges) {
      const s = e.source as SimNode
      const tgt = e.target as SimNode
      if (s.x === undefined || tgt.x === undefined) continue

      const isNeighborEdge = dimAll && neighborEdges.has(e)
      const alpha = dimAll ? (isNeighborEdge ? 0.75 : 0.04) : 0.22

      ctx.beginPath()
      ctx.moveTo(s.x!, s.y!)
      ctx.lineTo(tgt.x!, tgt.y!)
      ctx.strokeStyle = `rgba(100, 130, 200, ${alpha})`
      ctx.lineWidth = Math.max(0.5, e.weight * 2.5)
      ctx.stroke()

      // Render relationship label along highlighted edges
      if (isNeighborEdge && e.label && t.k > 0.3) {
        const mx = (s.x! + tgt.x!) / 2
        const my = (s.y! + tgt.y!) / 2
        const angle = Math.atan2(tgt.y! - s.y!, tgt.x! - s.x!)
        const fontSize = Math.max(8, 9 / t.k)
        ctx.save()
        ctx.globalAlpha = 0.9
        ctx.translate(mx, my)
        ctx.rotate(Math.abs(angle) > Math.PI / 2 ? angle + Math.PI : angle)
        ctx.font = `${fontSize}px Inter, system-ui, sans-serif`
        ctx.fillStyle = '#94a3b8'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'bottom'
        ctx.fillText(e.label, 0, -3 / t.k)
        ctx.restore()
      }
    }

    // Draw nodes
    for (const n of nodes) {
      if (n.x === undefined) continue

      const isHovered = hovered?.id === n.id
      const isSelected = selected?.id === n.id
      const isNeighbor = dimAll && neighborIds.has(n.id)
      const matchesSearch = query.length > 0 && n.label.toLowerCase().includes(query)

      let alpha = 1
      if (dimAll && !isNeighbor) alpha = 0.08
      if (query && !matchesSearch) alpha = 0.08

      const r = n.radius * (isHovered || isSelected ? 1.4 : 1)

      if (isHovered || isSelected || matchesSearch) {
        ctx.globalAlpha = 0.6
        const glow = ctx.createRadialGradient(n.x!, n.y!, r * 0.4, n.x!, n.y!, r * 2.8)
        glow.addColorStop(0, n.color + '66')
        glow.addColorStop(1, 'transparent')
        ctx.beginPath()
        ctx.arc(n.x!, n.y!, r * 2.8, 0, Math.PI * 2)
        ctx.fillStyle = glow
        ctx.fill()
        ctx.globalAlpha = 1
      }

      ctx.globalAlpha = alpha
      ctx.beginPath()
      ctx.arc(n.x!, n.y!, r, 0, Math.PI * 2)
      const grad = ctx.createRadialGradient(n.x! - r * 0.3, n.y! - r * 0.3, 0, n.x!, n.y!, r)
      grad.addColorStop(0, lighten(n.color, 50))
      grad.addColorStop(1, n.color)
      ctx.fillStyle = grad
      ctx.fill()

      if (isSelected) {
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 1.5 / t.k
        ctx.stroke()
      }

      ctx.globalAlpha = 1

      const showLabel = t.k > 0.4 || isHovered || isSelected || matchesSearch
      if (showLabel) {
        const labelAlpha = dimAll
          ? isNeighbor ? 1 : 0.1
          : query ? (matchesSearch ? 1 : 0.1) : 1
        ctx.globalAlpha = labelAlpha
        const fontSize = Math.max(9, 11 / t.k)
        ctx.font = `500 ${fontSize}px Inter, system-ui, sans-serif`
        ctx.fillStyle = '#cbd5e1'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        const label = n.label.length > 22 ? n.label.slice(0, 20) + '…' : n.label
        ctx.fillText(label, n.x!, n.y! + r + 5 / t.k)
        ctx.globalAlpha = 1
      }
    }

    ctx.restore()
  }, [])

  const searchRef = useRef(search)
  useEffect(() => { searchRef.current = search }, [search])

  const tick = useCallback(() => {
    draw(searchRef.current)
    animFrameRef.current = requestAnimationFrame(tick)
  }, [draw])

  const buildGraph = useCallback((rawNodes: GraphNode[], rawEdges: GraphEdge[]) => {
    const degreeMap: Record<string, number> = {}
    for (const e of rawEdges) {
      degreeMap[e.source] = (degreeMap[e.source] ?? 0) + 1
      degreeMap[e.target] = (degreeMap[e.target] ?? 0) + 1
    }

    const canvas = canvasRef.current
    const w = canvas?.width ?? 800
    const h = canvas?.height ?? 600

    const nodes: SimNode[] = rawNodes.map(n => {
      const deg = degreeMap[n.id] ?? 0
      return {
        id: n.id,
        label: n.label,
        type: n.type,
        degree: deg,
        radius: 6 + Math.sqrt(deg) * 4,
        color: getNodeColor(n.type),
        x: w / 2 + (Math.random() - 0.5) * 200,
        y: h / 2 + (Math.random() - 0.5) * 200,
      }
    })

    const nodeById = new Map(nodes.map(n => [n.id, n]))
    const edges: SimEdge[] = rawEdges
      .map(e => ({
        source: nodeById.get(e.source)!,
        target: nodeById.get(e.target)!,
        weight: e.weight,
        label: e.label,
      }))
      .filter(e => e.source && e.target)

    nodesRef.current = nodes
    edgesRef.current = edges
    setNodeCount(nodes.length)
    setEdgeCount(edges.length)

    if (simRef.current) simRef.current.stop()

    simRef.current = d3
      .forceSimulation<SimNode, SimEdge>(nodes)
      .force(
        'link',
        d3.forceLink<SimNode, SimEdge>(edges)
          .id(d => d.id)
          .distance(d => 80 + (1 - d.weight) * 60)
          .strength(0.5),
      )
      .force('charge', d3.forceManyBody<SimNode>().strength(d => -180 - d.radius * 10))
      .force('center', d3.forceCenter(w / 2, h / 2))
      .force('collide', d3.forceCollide<SimNode>().radius(d => d.radius + 16).strength(0.8))
      .alphaDecay(0.018)
  }, [])

  const load = useCallback(async (forceRefresh = false) => {
    setLoading(true)
    hoveredRef.current = null
    selectedRef.current = null
    setSelectedInfo(null)
    setSelectedEdges([])
    try {
      const data = forceRefresh ? await refreshGraph() : await getGraph()
      if (data.nodes.length === 0) {
        setEmpty(true)
        nodesRef.current = []
        edgesRef.current = []
      } else {
        setEmpty(false)
        buildGraph(data.nodes, data.edges)
      }
    } catch {
      setEmpty(true)
    } finally {
      setLoading(false)
    }
  }, [buildGraph])

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const resize = () => {
      canvas.width = container.clientWidth
      canvas.height = container.clientHeight
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(container)

    const getHitNode = (mx: number, my: number): SimNode | null => {
      const t = transformRef.current
      const wx = (mx - t.x) / t.k
      const wy = (my - t.y) / t.k
      for (const n of nodesRef.current) {
        if (n.x === undefined) continue
        const dx = wx - n.x!
        const dy = wy - n.y!
        if (Math.sqrt(dx * dx + dy * dy) <= n.radius + 6) return n
      }
      return null
    }

    type DragMember = { node: SimNode; initX: number; initY: number }
    let dragGroup: DragMember[] = []
    let dragStartWX = 0
    let dragStartWY = 0
    let isDraggingNode = false
    let movedDuringDrag = false

    const zoom = d3
      .zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([0.08, 10])
      .filter(e => {
        if (e.type === 'wheel') return true
        if (e.type === 'mousedown') {
          const me = e as MouseEvent
          const r = canvas.getBoundingClientRect()
          return getHitNode(me.clientX - r.left, me.clientY - r.top) === null
        }
        return true
      })
      .on('zoom', e => { transformRef.current = e.transform })
    d3.select(canvas).call(zoom)

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return
      const r = canvas.getBoundingClientRect()
      const hit = getHitNode(e.clientX - r.left, e.clientY - r.top)
      if (!hit) return

      isDraggingNode = true
      movedDuringDrag = false

      const t = transformRef.current
      dragStartWX = (e.clientX - r.left - t.x) / t.k
      dragStartWY = (e.clientY - r.top  - t.y) / t.k

      const neighborIds = new Set<string>()
      for (const edge of edgesRef.current) {
        const s = edge.source as SimNode
        const tgt = edge.target as SimNode
        if (s.id === hit.id) neighborIds.add(tgt.id)
        if (tgt.id === hit.id) neighborIds.add(s.id)
      }

      dragGroup = [hit, ...nodesRef.current.filter(n => neighborIds.has(n.id))].map(node => ({
        node, initX: node.x ?? 0, initY: node.y ?? 0,
      }))

      for (const m of dragGroup) { m.node.fx = m.initX; m.node.fy = m.initY }
      simRef.current?.alphaTarget(0.05).restart()
      canvas.style.cursor = 'grabbing'
    }

    const onMouseMove = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect()
      const mx = e.clientX - r.left
      const my = e.clientY - r.top

      if (isDraggingNode && dragGroup.length > 0) {
        movedDuringDrag = true
        const t = transformRef.current
        const ddx = (mx - t.x) / t.k - dragStartWX
        const ddy = (my - t.y) / t.k - dragStartWY
        for (const m of dragGroup) { m.node.fx = m.initX + ddx; m.node.fy = m.initY + ddy }
        return
      }

      hoveredRef.current = getHitNode(mx, my)
      canvas.style.cursor = hoveredRef.current ? 'pointer' : 'grab'
    }

    const onMouseUp = (e: MouseEvent) => {
      if (!isDraggingNode) return
      isDraggingNode = false
      for (const m of dragGroup) { m.node.fx = null; m.node.fy = null }
      dragGroup = []
      simRef.current?.alphaTarget(0).alpha(0.15).restart()
      const r = canvas.getBoundingClientRect()
      hoveredRef.current = getHitNode(e.clientX - r.left, e.clientY - r.top)
      canvas.style.cursor = hoveredRef.current ? 'pointer' : 'grab'
    }

    const onClick = (e: MouseEvent) => {
      if (movedDuringDrag) { movedDuringDrag = false; return }
      const r = canvas.getBoundingClientRect()
      const hit = getHitNode(e.clientX - r.left, e.clientY - r.top)
      const next = hit?.id === selectedRef.current?.id ? null : hit
      selectedRef.current = next
      setSelectedInfo(next)
      if (next) {
        const connected = edgesRef.current.filter(edge => {
          const s = edge.source as SimNode
          const tgt = edge.target as SimNode
          return s.id === next.id || tgt.id === next.id
        })
        setSelectedEdges(connected)
      } else {
        setSelectedEdges([])
      }
    }

    const onLeave = () => {
      hoveredRef.current = null
      if (isDraggingNode) {
        isDraggingNode = false
        for (const m of dragGroup) { m.node.fx = null; m.node.fy = null }
        dragGroup = []
        simRef.current?.alphaTarget(0).alpha(0.15).restart()
      }
    }

    canvas.addEventListener('mousedown', onMouseDown)
    canvas.addEventListener('mousemove', onMouseMove)
    canvas.addEventListener('mouseup', onMouseUp)
    canvas.addEventListener('click', onClick)
    canvas.addEventListener('mouseleave', onLeave)

    return () => {
      ro.disconnect()
      canvas.removeEventListener('mousedown', onMouseDown)
      canvas.removeEventListener('mousemove', onMouseMove)
      canvas.removeEventListener('mouseup', onMouseUp)
      canvas.removeEventListener('click', onClick)
      canvas.removeEventListener('mouseleave', onLeave)
    }
  }, [])

  useEffect(() => {
    animFrameRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animFrameRef.current)
  }, [tick])

  useEffect(() => { load() }, [load])

  function clearSelection() {
    selectedRef.current = null
    setSelectedInfo(null)
    setSelectedEdges([])
  }

  return (
    <div className="graph-container">
      <div className="graph-header">
        <div className="graph-title">
          <GitBranch size={16} />
          <span>Knowledge Graph</span>
          {nodeCount > 0 && (
            <span className="graph-stats">{nodeCount} concepts · {edgeCount} relations</span>
          )}
        </div>
        <div className="graph-header-actions">
          <div className="graph-search">
            <Search size={12} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search concepts…"
            />
            {search && (
              <button className="search-clear" onClick={() => setSearch('')}>
                <X size={11} />
              </button>
            )}
          </div>
          <button
            className="icon-btn"
            onClick={() => load(true)}
            title="Re-extract concept graph from knowledge base"
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
          </button>
        </div>
      </div>

      <div className="graph-legend">
        {Object.entries(CONCEPT_COLORS).map(([type, color]) => (
          <span key={type} className="legend-item">
            <span className="legend-dot" style={{ background: color }} />
            {type}
          </span>
        ))}
      </div>

      <div className="graph-canvas" ref={containerRef}>
        {loading ? (
          <div className="graph-empty">
            <RefreshCw size={32} className="spin" />
            <p>Extracting concepts from knowledge base…</p>
          </div>
        ) : empty ? (
          <div className="graph-empty">
            <GitBranch size={32} />
            <p>Upload documents then click ↻ to build the concept graph</p>
          </div>
        ) : (
          <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
        )}

        {selectedInfo && (
          <div className="graph-node-info">
            <span
              className="graph-node-color"
              style={{ background: getNodeColor(selectedInfo.type) }}
            />
            <div className="graph-node-text">
              <span className="graph-node-name">{selectedInfo.label}</span>
              <span className="graph-node-meta">
                {selectedInfo.type} · {selectedInfo.degree} connection{selectedInfo.degree !== 1 ? 's' : ''}
              </span>
              {selectedEdges.length > 0 && (
                <ul className="graph-node-edges">
                  {selectedEdges.map((e, i) => {
                    const s = e.source as SimNode
                    const tgt = e.target as SimNode
                    const other = s.id === selectedInfo.id ? tgt : s
                    const arrow = s.id === selectedInfo.id ? '→' : '←'
                    return (
                      <li key={i}>
                        <span className="edge-relation">{arrow} {e.label ?? 'related'}</span>
                        <span style={{ color: getNodeColor(other.type) }}>{other.label}</span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
            <button className="search-clear" onClick={clearSelection}>
              <X size={12} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
