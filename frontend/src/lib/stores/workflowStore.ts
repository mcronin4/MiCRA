import { create } from 'zustand'

export type NodeStatus = 'idle' | 'running' | 'completed' | 'error'

export interface WorkflowNodeState {
  id: string
  type: string
  status: NodeStatus
  inputs: Record<string, any>
  outputs: Record<string, any> | null
  error?: string
}

interface WorkflowStore {
  nodes: Record<string, WorkflowNodeState>
  
  addNode: (node: WorkflowNodeState) => void
  removeNode: (nodeId: string) => void
  updateNode: (nodeId: string, updates: Partial<WorkflowNodeState>) => void
}

export const useWorkflowStore = create<WorkflowStore>((set) => ({
  nodes: {},
  
  addNode: (node) => set((state) => ({
    nodes: { ...state.nodes, [node.id]: node }
  })),
  
  removeNode: (nodeId) => set((state) => {
    const { [nodeId]: _, ...rest } = state.nodes
    return { nodes: rest }
  }),
  
  updateNode: (nodeId, updates) => set((state) => ({
    nodes: {
      ...state.nodes,
      [nodeId]: { ...state.nodes[nodeId], ...updates }
    }
  })),
}))

