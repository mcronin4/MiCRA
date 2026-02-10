import { create } from 'zustand'
import type { Node, Edge } from '@xyflow/react'
import type { SavedWorkflowData, SavedWorkflowNode, SavedWorkflowEdge } from '@/lib/fastapi/workflows'

export type NodeStatus = 'idle' | 'pending' | 'running' | 'completed' | 'error'

export interface WorkflowNodeState {
  id: string
  type: string
  status: NodeStatus
  inputs: Record<string, unknown>
  outputs: Record<string, unknown> | null
  error?: string
  manualInputEnabled?: boolean
}

// Image bucket item for centralized image storage
export interface ImageBucketItem {
  id: string
  base64?: string  // Optional for backward compatibility, prefer signedUrl
  fileId?: string  // File ID from R2 storage
  signedUrl?: string  // Presigned URL for R2 storage
  name: string
  addedAt: number
}

/**
 * Input port keys that receive data from edges (from backend node registry).
 * Any key in node.inputs NOT in this list is a config param and gets persisted.
 * When adding a new node type, add its connected input keys here.
 */
const CONNECTED_INPUT_KEYS: Record<string, string[]> = {
  End: ['end-input'],
  TextGeneration: ['text'],
  ImageGeneration: ['prompt', 'image'],
  ImageMatching: ['images', 'text'],
  Transcription: ['audio', 'video'],
  ImageExtraction: ['source'],
  QuoteExtraction: ['text'],
  ImageBucket: [],
  AudioBucket: [],
  VideoBucket: [],
  TextBucket: [],
}

/** Returns input keys that are params (not connected) for a node type. Exported for prepareWorkflowForExecution. */
export function getParamKeysToPersist(nodeType: string, inputs: Record<string, unknown>): string[] {
  const connected = CONNECTED_INPUT_KEYS[nodeType] ?? []
  const connectedSet = new Set(connected)
  return Object.keys(inputs).filter((k) => !connectedSet.has(k))
}

interface WorkflowStore {
  nodes: Record<string, WorkflowNodeState>

  // Centralized image bucket
  imageBucket: ImageBucketItem[]

  // Workflow metadata
  currentWorkflowId: string | undefined
  workflowName: string
  workflowDescription: string | undefined

  // ReactFlow visual state (survives page navigation)
  reactFlowNodes: Node[]
  reactFlowEdges: Edge[]

  addNode: (node: WorkflowNodeState) => void
  removeNode: (nodeId: string) => void
  updateNode: (nodeId: string, updates: Partial<WorkflowNodeState>) => void

  // Image bucket actions
  addImagesToBucket: (images: Omit<ImageBucketItem, 'addedAt'>[]) => void
  removeImageFromBucket: (imageId: string) => void
  clearImageBucket: () => void

  // Workflow metadata actions
  setCurrentWorkflowId: (id: string | undefined) => void
  setWorkflowName: (name: string) => void
  setWorkflowDescription: (description: string | undefined) => void
  setWorkflowMetadata: (id: string | undefined, name: string, description?: string | undefined) => void
  clearWorkflowMetadata: () => void

  // ReactFlow state sync
  setReactFlowState: (nodes: Node[], edges: Edge[]) => void

  // Workflow persistence methods
  exportWorkflowStructure: (reactFlowNodes: Node[], reactFlowEdges: Edge[]) => SavedWorkflowData
  importWorkflowStructure: (savedData: SavedWorkflowData) => {
    reactFlowNodes: Node[]
    reactFlowEdges: Edge[]
  }
  // Export workflow data for execution (includes runtime inputs like selected_file_ids)
  exportWorkflowForExecution: (reactFlowNodes: Node[], reactFlowEdges: Edge[]) => SavedWorkflowData
  reset: () => void
}

export const useWorkflowStore = create<WorkflowStore>((set, get) => ({
  nodes: {},
  imageBucket: [],
  currentWorkflowId: undefined,
  workflowName: 'Untitled Workflow',
  workflowDescription: undefined,
  reactFlowNodes: [],
  reactFlowEdges: [],

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

  // Image bucket actions
  addImagesToBucket: (images) => set((state) => ({
    imageBucket: [
      ...state.imageBucket,
      ...images.map((img) => ({
        ...img,
        addedAt: Date.now(),
      })),
    ],
  })),

  removeImageFromBucket: (imageId) => set((state) => ({
    imageBucket: state.imageBucket.filter((img) => img.id !== imageId),
  })),

  clearImageBucket: () => set({ imageBucket: [] }),

  // Workflow metadata actions
  setCurrentWorkflowId: (id) => set({ currentWorkflowId: id }),
  setWorkflowName: (name) => set({ workflowName: name }),
  setWorkflowDescription: (description) => set({ workflowDescription: description }),
  setWorkflowMetadata: (id, name, description) => set({
    currentWorkflowId: id,
    workflowName: name,
    workflowDescription: description,
  }),
  clearWorkflowMetadata: () => set({
    currentWorkflowId: undefined,
    workflowName: 'Untitled Workflow',
    workflowDescription: undefined,
    reactFlowNodes: [],
    reactFlowEdges: [],
  }),

  setReactFlowState: (nodes, edges) => set({
    reactFlowNodes: nodes,
    reactFlowEdges: edges,
  }),

  /**
   * Export workflow structure for saving.
   * Extracts structural information and node config params needed for execute-by-id.
   * Config params are persisted so re-run from the preview page works without
   * requiring the canvas to be loaded. Persists whatever the user set (no defaults).
   */
  exportWorkflowStructure: (reactFlowNodes, reactFlowEdges) => {
    const store = get()
    const savedNodes: SavedWorkflowNode[] = reactFlowNodes.map((node) => {
      const nodeState = store.nodes[node.id]
      const baseData: Record<string, unknown> =
        node.data?.label && typeof node.data.label === 'string'
          ? { label: node.data.label }
          : {}

      if (nodeState?.inputs && node.type) {
        const paramKeys = getParamKeysToPersist(node.type, nodeState.inputs)
        for (const key of paramKeys) {
          const value = nodeState.inputs[key]
          if (value === undefined) continue
          if (key === 'preset_id' && (value === '' || value === null)) continue
          if (key === 'selected_file_ids' && (!Array.isArray(value) || value.length === 0)) continue
          baseData[key] = value
        }
      }

      return {
        id: node.id,
        type: node.type || 'default',
        position: node.position,
        data: Object.keys(baseData).length > 0 ? baseData : undefined,
      }
    })

    // Extract only structural properties from ReactFlow edges
    const savedEdges: SavedWorkflowEdge[] = reactFlowEdges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle ?? undefined,
      targetHandle: edge.targetHandle ?? undefined,
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
   * with nodes in 'idle' state. Restores persisted config params from node.data
   * into store inputs so the canvas displays them correctly (no defaults).
   */
  importWorkflowStructure: (savedData) => {
    const store = get()
    store.reset()

    const reactFlowNodes: Node[] = savedData.nodes.map((savedNode) => {
      const savedDataObj = savedNode.data as Record<string, unknown> | undefined
      const inputs: Record<string, unknown> = {}

      if (savedDataObj) {
        for (const key of Object.keys(savedDataObj)) {
          if (key === 'label') continue
          inputs[key] = savedDataObj[key]
        }
      }

      const node: Node = {
        id: savedNode.id,
        type: savedNode.type,
        position: savedNode.position,
        data: savedNode.data || { label: `${savedNode.type} node` },
      }

      store.addNode({
        id: savedNode.id,
        type: savedNode.type,
        status: 'idle',
        inputs,
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
      ...(savedEdge.type && typeof savedEdge.type === 'string' ? { type: savedEdge.type } : {}),
    }))

    // Cache in store so canvas state survives page navigation
    set({ reactFlowNodes, reactFlowEdges })

    return {
      reactFlowNodes,
      reactFlowEdges,
    }
  },

  /**
   * Export workflow data for execution.
   * Unlike exportWorkflowStructure (for persistence), this includes runtime inputs
   * such as selected_file_ids for bucket nodes, which are needed during execution.
   */
  exportWorkflowForExecution: (reactFlowNodes, reactFlowEdges) => {
    const store = get()

    // Bucket node types that need their inputs included
    const bucketNodeTypes = ['ImageBucket', 'AudioBucket', 'VideoBucket', 'TextBucket']

    // Extract nodes with runtime inputs for bucket nodes
    const savedNodes: SavedWorkflowNode[] = reactFlowNodes.map((node) => {
      const nodeState = store.nodes[node.id]
      const isBucketNode = bucketNodeTypes.includes(node.type || '')

      // For bucket nodes, include selected_file_ids from the workflow store
      // These are needed by the backend executor
      if (isBucketNode && nodeState?.inputs?.selected_file_ids) {
        return {
          id: node.id,
          type: node.type || 'default',
          position: node.position,
          data: {
            ...(node.data?.label && typeof node.data.label === 'string' ? { label: node.data.label } : {}),
            selected_file_ids: nodeState.inputs.selected_file_ids,
          },
        }
      }

      // For non-bucket nodes, use the same format as exportWorkflowStructure
      return {
        id: node.id,
        type: node.type || 'default',
        position: node.position,
        data: (node.data?.label && typeof node.data.label === 'string')
          ? { label: node.data.label }
          : undefined,
      }
    })

    // Extract edges (same as exportWorkflowStructure)
    const savedEdges: SavedWorkflowEdge[] = reactFlowEdges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle ?? undefined,
      targetHandle: edge.targetHandle ?? undefined,
    }))

    return {
      nodes: savedNodes,
      edges: savedEdges,
    }
  },

  /**
   * Reset workflow store to empty state.
   * Note: Does NOT clear imageBucket or workflow metadata - they persist across workflow changes
   */
  reset: () => set({ nodes: {}, reactFlowNodes: [], reactFlowEdges: [] }),
}))
