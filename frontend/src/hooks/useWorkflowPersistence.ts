/**
 * Hook for workflow save/load functionality.
 * 
 * NOTE: Only workflow structure is persisted. Node inputs/outputs, attachments,
 * and execution state are NOT saved. All workflows load with nodes in 'idle' state.
 */

import { useState, useCallback } from 'react'
import type { Node, Edge, ReactFlowInstance } from '@xyflow/react'
import { useWorkflowStore } from '@/lib/stores/workflowStore'
import {
  listWorkflows,
  listTemplates,
  getWorkflow,
  createWorkflow,
  updateWorkflow,
  deleteWorkflow,
  type CreateWorkflowRequest,
} from '@/lib/fastapi/workflows'

export function useWorkflowPersistence() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const exportWorkflowStructure = useWorkflowStore(
    (state) => state.exportWorkflowStructure
  )
  const importWorkflowStructure = useWorkflowStore(
    (state) => state.importWorkflowStructure
  )

  /**
   * Save current workflow to backend.
   */
  const saveWorkflow = useCallback(
    async (
      name: string,
      description: string | undefined,
      reactFlowNodes: Node[],
      reactFlowEdges: Edge[],
      existingWorkflowId?: string
    ): Promise<{ success: boolean; workflowId?: string; error?: string }> => {
      setIsLoading(true)
      setError(null)

      try {
        // Export structure only (no data/attachments)
        const workflowData = exportWorkflowStructure(reactFlowNodes, reactFlowEdges)

        if (existingWorkflowId) {
          // Safety check: verify the workflow exists and is not a system workflow
          // If it's a system workflow, create a new workflow instead of updating
          try {
            const existingWorkflow = await getWorkflow(existingWorkflowId)
            if (existingWorkflow.is_system) {
              // Template was loaded and modified - create a new workflow instead
              const request: CreateWorkflowRequest = {
                name,
                description,
                workflow_data: workflowData,
                is_system: false,
              }

              const response = await createWorkflow(request)
              return { success: true, workflowId: response.id }
            }
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          } catch (_fetchErr) {
            // If workflow doesn't exist or can't be fetched, create a new one
            const request: CreateWorkflowRequest = {
              name,
              description,
              workflow_data: workflowData,
              is_system: false,
            }

            const response = await createWorkflow(request)
            return { success: true, workflowId: response.id }
          }

          // Update existing workflow (only reaches here if it's not a system workflow)
          await updateWorkflow(existingWorkflowId, {
            name,
            description,
            workflow_data: workflowData,
          })

          return { success: true, workflowId: existingWorkflowId }
        } else {
          // Create new workflow
          const request: CreateWorkflowRequest = {
            name,
            description,
            workflow_data: workflowData,
            is_system: false,
          }

          const response = await createWorkflow(request)

          return { success: true, workflowId: response.id }
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error'
        setError(errorMessage)
        return { success: false, error: errorMessage }
      } finally {
        setIsLoading(false)
      }
    },
    [exportWorkflowStructure]
  )

  /**
   * Load workflow from backend and return ReactFlow nodes/edges.
   */
  const loadWorkflow = useCallback(
    async (
      workflowId: string,
      reactFlowInstance: ReactFlowInstance | null
    ): Promise<{
      success: boolean
      nodes?: Node[]
      edges?: Edge[]
      workflowName?: string
      error?: string
    }> => {
      setIsLoading(true)
      setError(null)

      try {
        const response = await getWorkflow(workflowId)

        // Import structure and create ReactFlow nodes/edges
        const { reactFlowNodes, reactFlowEdges } = importWorkflowStructure(
          response.workflow_data
        )

        // Fit view after loading (viewport not saved)
        // Use larger padding (0.5 = 50%) to give more breathing room
        setTimeout(() => {
          reactFlowInstance?.fitView({ padding: 0.5, duration: 300 })
        }, 100)

        return {
          success: true,
          nodes: reactFlowNodes,
          edges: reactFlowEdges,
          workflowName: response.name,
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error'
        setError(errorMessage)
        return { success: false, error: errorMessage }
      } finally {
        setIsLoading(false)
      }
    },
    [importWorkflowStructure]
  )

  /**
   * List user workflows (non-system workflows for the current user).
   */
  const fetchWorkflows = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const workflows = await listWorkflows()
      return { success: true, workflows }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      setError(errorMessage)
      return { success: false, error: errorMessage, workflows: [] }
    } finally {
      setIsLoading(false)
    }
  }, [])

  /**
   * List only pre-built templates.
   */
  const fetchTemplates = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const templates = await listTemplates()
      return { success: true, templates }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      setError(errorMessage)
      return { success: false, error: errorMessage, templates: [] }
    } finally {
      setIsLoading(false)
    }
  }, [])

  /**
   * Delete a workflow.
   */
  const removeWorkflow = useCallback(async (workflowId: string) => {
    setIsLoading(true)
    setError(null)

    try {
      await deleteWorkflow(workflowId)
      return { success: true }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      setError(errorMessage)
      return { success: false, error: errorMessage }
    } finally {
      setIsLoading(false)
    }
  }, [])

  return {
    isLoading,
    error,
    saveWorkflow,
    loadWorkflow,
    fetchWorkflows,
    fetchTemplates,
    removeWorkflow,
  }
}
