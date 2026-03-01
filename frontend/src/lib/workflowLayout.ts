import type { SavedWorkflowData, SavedWorkflowNode } from '@/lib/fastapi/workflows'

export type WorkflowLayoutMode = 'full' | 'touched'

export interface WorkflowLayoutOptions {
  mode: WorkflowLayoutMode
  touchedNodeIds?: string[]
  originX?: number
  originY?: number
  colGap?: number
  rowGap?: number
}

const DEFAULT_ORIGIN_X = 160
const DEFAULT_ORIGIN_Y = 120
const DEFAULT_COL_GAP = 560
const DEFAULT_ROW_GAP = 340
const COLLISION_X = 420
const COLLISION_Y = 280

export function layoutWorkflowData(
  workflowData: SavedWorkflowData,
  options: WorkflowLayoutOptions
): SavedWorkflowData {
  const originX = options.originX ?? DEFAULT_ORIGIN_X
  const originY = options.originY ?? DEFAULT_ORIGIN_Y
  const colGap = options.colGap ?? DEFAULT_COL_GAP
  const rowGap = options.rowGap ?? DEFAULT_ROW_GAP

  const nodes = workflowData.nodes.map((node) => ({ ...node, position: { ...node.position } }))
  const edges = workflowData.edges.map((edge) => ({ ...edge }))

  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const allNodeIds = new Set(nodes.map((node) => node.id))

  const touched = new Set<string>()
  if (options.mode === 'full') {
    nodes.forEach((node) => touched.add(node.id))
  } else {
    ;(options.touchedNodeIds ?? []).forEach((id) => {
      if (allNodeIds.has(id)) touched.add(id)
    })
    // Include direct neighbors so reroutes look coherent.
    edges.forEach((edge) => {
      if (touched.has(edge.source)) touched.add(edge.target)
      if (touched.has(edge.target)) touched.add(edge.source)
    })
  }

  if (touched.size === 0) {
    return { nodes, edges }
  }

  const fixedNodes = nodes.filter((node) => !touched.has(node.id))
  const layoutNodes = nodes.filter((node) => touched.has(node.id))

  const indegree = new Map<string, number>()
  const outgoing = new Map<string, string[]>()
  const incoming = new Map<string, string[]>()
  layoutNodes.forEach((node) => {
    indegree.set(node.id, 0)
    outgoing.set(node.id, [])
    incoming.set(node.id, [])
  })

  const activeEdges = edges.filter((edge) => touched.has(edge.source) && touched.has(edge.target))

  edges.forEach((edge) => {
    if (!touched.has(edge.source) || !touched.has(edge.target)) return
    outgoing.get(edge.source)?.push(edge.target)
    incoming.get(edge.target)?.push(edge.source)
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1)
  })

  const queue: string[] = layoutNodes
    .filter((node) => (indegree.get(node.id) ?? 0) === 0)
    .sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x)
    .map((node) => node.id)

  const topo: string[] = []
  const layerById = new Map<string, number>()
  layoutNodes.forEach((node) => layerById.set(node.id, 0))

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current) break
    topo.push(current)
    for (const next of outgoing.get(current) ?? []) {
      layerById.set(next, Math.max(layerById.get(next) ?? 0, (layerById.get(current) ?? 0) + 1))
      const nextIn = (indegree.get(next) ?? 0) - 1
      indegree.set(next, nextIn)
      if (nextIn === 0) queue.push(next)
    }
  }

  if (topo.length < layoutNodes.length) {
    layoutNodes
      .map((node) => node.id)
      .filter((id) => !topo.includes(id))
      .forEach((id) => {
        topo.push(id)
        const sourceLayers = (incoming.get(id) ?? []).map((src) => layerById.get(src) ?? 0)
        const nextLayer = sourceLayers.length > 0 ? Math.max(...sourceLayers) + 1 : 0
        layerById.set(id, Math.max(layerById.get(id) ?? 0, nextLayer))
      })
  }

  // Enforce strict left-to-right constraints for every active edge.
  // This guarantees that targets are always to the right of their sources.
  for (let i = 0; i < layoutNodes.length; i += 1) {
    let changed = false
    for (const edge of activeEdges) {
      const srcLayer = layerById.get(edge.source) ?? 0
      const tgtLayer = layerById.get(edge.target) ?? 0
      if (tgtLayer <= srcLayer) {
        layerById.set(edge.target, srcLayer + 1)
        changed = true
      }
    }
    if (!changed) break
  }

  const layers = new Map<number, string[]>()
  topo.forEach((id) => {
    const layer = layerById.get(id) ?? 0
    if (!layers.has(layer)) layers.set(layer, [])
    layers.get(layer)?.push(id)
  })

  const occupied: Array<{ x: number; y: number }> = [
    ...fixedNodes.map((node) => ({ x: node.position.x, y: node.position.y })),
  ]

  const sortedLayers = Array.from(layers.keys()).sort((a, b) => a - b)
  const placedY = new Map<string, number>()
  sortedLayers.forEach((layerIndex) => {
    const layerNodes = layers.get(layerIndex) ?? []
    const orderedNodes = [...layerNodes].sort((a, b) => {
      const incomingA = incoming.get(a) ?? []
      const incomingB = incoming.get(b) ?? []
      const avgA =
        incomingA.length > 0
          ? incomingA.reduce((sum, id) => sum + (placedY.get(id) ?? originY), 0) / incomingA.length
          : (nodeById.get(a)?.position.y ?? originY)
      const avgB =
        incomingB.length > 0
          ? incomingB.reduce((sum, id) => sum + (placedY.get(id) ?? originY), 0) / incomingB.length
          : (nodeById.get(b)?.position.y ?? originY)
      return avgA - avgB
    })

    orderedNodes.forEach((nodeId, rowIndex) => {
      const node = nodeById.get(nodeId)
      if (!node) return
      const x = originX + layerIndex * colGap
      let y = originY + rowIndex * rowGap
      while (hasCollision(x, y, occupied)) {
        y += Math.max(120, Math.floor(rowGap / 2))
      }
      node.position = { x, y }
      occupied.push({ x, y })
      placedY.set(nodeId, y)
    })
  })

  return { nodes, edges }
}

function hasCollision(
  x: number,
  y: number,
  occupied: Array<{ x: number; y: number }>
): boolean {
  return occupied.some((point) => Math.abs(point.x - x) < COLLISION_X && Math.abs(point.y - y) < COLLISION_Y)
}

export function getNodeIds(nodes: SavedWorkflowNode[]): string[] {
  return nodes.map((node) => node.id)
}
