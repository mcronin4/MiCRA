import { create } from 'zustand'
import type { Node, Edge } from '@xyflow/react'
import type { SavedWorkflowData, SavedWorkflowNode, SavedWorkflowEdge } from '@/lib/fastapi/workflows'

export type NodeStatus = 'idle' | 'running' | 'completed' | 'error'

export interface WorkflowNodeState {
  id: string
  type: string
  status: NodeStatus
  inputs: Record<string, unknown>
  outputs: Record<string, unknown> | null
  error?: string
}

interface WorkflowStore {
  nodes: Record<string, WorkflowNodeState>
  
  addNode: (node: WorkflowNodeState) => void
  removeNode: (nodeId: string) => void
  updateNode: (nodeId: string, updates: Partial<WorkflowNodeState>) => void
  
  // Workflow persistence methods
  exportWorkflowStructure: (reactFlowNodes: Node[], reactFlowEdges: Edge[]) => SavedWorkflowData
  importWorkflowStructure: (savedData: SavedWorkflowData) => {
    reactFlowNodes: Node[]
    reactFlowEdges: Edge[]
  }
  reset: () => void
}

export const useWorkflowStore = create<WorkflowStore>((set, get) => ({
  nodes: {},
  
  addNode: (node) => set((state) => ({
    nodes: { ...state.nodes, [node.id]: node }
  })),
  
  removeNode: (nodeId) => set((state) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { [nodeId]: _, ...rest } = state.nodes
    return { nodes: rest }
  }),
  
  updateNode: (nodeId, updates) => set((state) => ({
    nodes: {
      ...state.nodes,
      [nodeId]: { ...state.nodes[nodeId], ...updates }
    }
  })),

  /**
   * Export workflow structure for saving.
   * Only extracts structural information (nodes, edges, positions).
   * Does NOT include node inputs/outputs, attachments, or execution state.
   * 
   * NOTE: This is intentionally generic and works with any node type
   * without making assumptions about node-specific data structures.
   */
  exportWorkflowStructure: (reactFlowNodes, reactFlowEdges) => {
    // Extract only structural properties from ReactFlow nodes
    const savedNodes: SavedWorkflowNode[] = reactFlowNodes.map((node) => ({
      id: node.id,
      type: node.type || 'default',
      position: node.position,
      // Only preserve label from data if present, ignore everything else
      data: node.data?.label ? { label: node.data.label } : undefined,
      // Preserve other ReactFlow node properties generically (width, height, etc.)
      // but exclude anything that looks like workflow-specific state
    }))

    // Extract only structural properties from ReactFlow edges
    const savedEdges: SavedWorkflowEdge[] = reactFlowEdges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
      // Preserve other ReactFlow edge properties generically
    }))

    return {
      nodes: savedNodes,
      edges: savedEdges,
    }
  },

  /**
   * Import workflow structure from saved data.
   * Creates ReactFlow nodes and edges, and initializes workflow store
   * with nodes in 'idle' state and empty inputs.
   * 
   * NOTE: Node inputs/outputs are NOT restored - nodes start fresh.
   * This makes the system robust to new node types without breaking existing workflows.
   */
  importWorkflowStructure: (savedData) => {
    const store = get()
    
    // Reset store first
    store.reset()
    
    // Convert saved nodes to ReactFlow format
    const reactFlowNodes: Node[] = savedData.nodes.map((savedNode) => {
      // Create base ReactFlow node structure
      const node: Node = {
        id: savedNode.id,
        type: savedNode.type,
        position: savedNode.position,
        data: savedNode.data || { label: `${savedNode.type} node` },
      }
      
      // Initialize workflow store state for this node (idle, empty inputs)
      store.addNode({
        id: savedNode.id,
        type: savedNode.type,
        status: 'idle',
        inputs: {},
        outputs: null,
      })
      
      return node
    })
    
    // Convert saved edges to ReactFlow format
    const reactFlowEdges: Edge[] = savedData.edges.map((savedEdge) => ({
      id: savedEdge.id,
      source: savedEdge.source,
      target: savedEdge.target,
      sourceHandle: savedEdge.sourceHandle,
      targetHandle: savedEdge.targetHandle,
      // Preserve other edge properties if present
      ...(savedEdge.type && { type: savedEdge.type as string }),
    }))
    
    return {
      reactFlowNodes,
      reactFlowEdges,
    }
  },

  /**
   * Reset workflow store to empty state.
   */
  reset: () => set({ nodes: {} }),
}))

