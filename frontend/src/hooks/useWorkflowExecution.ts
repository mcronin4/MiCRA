import { useState, useCallback } from 'react'
import { useWorkflowStore } from '@/lib/stores/workflowStore'
import { executeWorkflow, executeWorkflowById } from '@/lib/fastapi/workflows'
import type { SavedWorkflowData } from '@/lib/fastapi/workflows'
import type { WorkflowExecutionResult } from '@/types/workflow-execution'

export function useWorkflowExecution() {
  const [isExecuting, setIsExecuting] = useState(false)
  const [executionResult, setExecutionResult] =
    useState<WorkflowExecutionResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { nodes: storeNodes, updateNode } = useWorkflowStore()

  const applyResults = useCallback(
    (result: WorkflowExecutionResult) => {
      for (const nr of result.node_results) {
        updateNode(nr.node_id, {
          status: nr.status === 'completed' ? 'completed' : 'error',
          outputs: nr.outputs ?? undefined,
          error: nr.error ?? undefined,
        })
      }
    },
    [updateNode]
  )

  const resetNodes = useCallback(() => {
    for (const nodeId of Object.keys(storeNodes)) {
      updateNode(nodeId, { status: 'idle', outputs: null, error: undefined })
    }
  }, [storeNodes, updateNode])

  const execute = useCallback(
    async (workflowData: SavedWorkflowData) => {
      setIsExecuting(true)
      setError(null)
      setExecutionResult(null)
      resetNodes()

      // Mark all nodes as running
      for (const nodeId of Object.keys(storeNodes)) {
        updateNode(nodeId, { status: 'running' })
      }

      try {
        const result = await executeWorkflow(workflowData)
        setExecutionResult(result)
        applyResults(result)
        return result
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        setError(msg)
        resetNodes()
        throw err
      } finally {
        setIsExecuting(false)
      }
    },
    [storeNodes, updateNode, resetNodes, applyResults]
  )

  const executeById = useCallback(
    async (workflowId: string) => {
      setIsExecuting(true)
      setError(null)
      setExecutionResult(null)
      resetNodes()

      for (const nodeId of Object.keys(storeNodes)) {
        updateNode(nodeId, { status: 'running' })
      }

      try {
        const result = await executeWorkflowById(workflowId)
        setExecutionResult(result)
        applyResults(result)
        return result
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        setError(msg)
        resetNodes()
        throw err
      } finally {
        setIsExecuting(false)
      }
    },
    [storeNodes, updateNode, resetNodes, applyResults]
  )

  const reset = useCallback(() => {
    setIsExecuting(false)
    setExecutionResult(null)
    setError(null)
    resetNodes()
  }, [resetNodes])

  return { execute, executeById, isExecuting, executionResult, error, reset }
}
