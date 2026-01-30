import { useState, useCallback, useRef } from 'react'
import { flushSync } from 'react-dom'
import { useWorkflowStore } from '@/lib/stores/workflowStore'
import {
  executeWorkflowStreaming,
  executeWorkflowByIdStreaming,
} from '@/lib/fastapi/workflows'
import type { SavedWorkflowData, StreamingExecutionEvent } from '@/lib/fastapi/workflows'
import type { WorkflowExecutionResult } from '@/types/workflow-execution'

export function useWorkflowExecution() {
  const [isExecuting, setIsExecuting] = useState(false)
  const [executionResult, setExecutionResult] =
    useState<WorkflowExecutionResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [currentNode, setCurrentNode] = useState<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const { nodes: storeNodes, updateNode } = useWorkflowStore()

  const resetNodes = useCallback(() => {
    for (const nodeId of Object.keys(storeNodes)) {
      updateNode(nodeId, { status: 'idle', outputs: null, error: undefined })
    }
  }, [storeNodes, updateNode])

  const handleStreamEvent = useCallback(
    (event: StreamingExecutionEvent) => {
      // Use flushSync to force immediate DOM updates for each event
      flushSync(() => {
        switch (event.event) {
          case 'workflow_start':
            // Mark all nodes in execution order as "pending" (ready to run)
            for (const nodeId of event.execution_order) {
              updateNode(nodeId, { status: 'pending', error: undefined })
            }
            break

          case 'node_start':
            setCurrentNode(event.node_id)
            updateNode(event.node_id, { status: 'running', error: undefined })
            break

          case 'node_complete':
            updateNode(event.node_id, {
              status: 'completed',
              outputs: event.outputs,
              error: undefined,
            })
            break

          case 'node_error':
            updateNode(event.node_id, {
              status: 'error',
              error: event.error,
            })
            break

          case 'workflow_complete':
            setExecutionResult({
              success: true,
              workflow_outputs: event.workflow_outputs,
              node_results: event.node_results,
              total_execution_time_ms: event.total_execution_time_ms,
              error: null,
            })
            setCurrentNode(null)
            break

          case 'workflow_error':
            setError(event.error)
            if (event.node_results) {
              setExecutionResult({
                success: false,
                workflow_outputs: {},
                node_results: event.node_results,
                total_execution_time_ms: event.total_execution_time_ms,
                error: event.error,
              })
            }
            setCurrentNode(null)
            break
        }
      })
    },
    [updateNode]
  )

  const execute = useCallback(
    async (
      workflowData: SavedWorkflowData,
      workflowId?: string | null,
      workflowName?: string | null
    ) => {
      setIsExecuting(true)
      setError(null)
      setExecutionResult(null)
      setCurrentNode(null)
      resetNodes()

      // Mark all nodes as pending (waiting to run)
      for (const nodeId of Object.keys(storeNodes)) {
        updateNode(nodeId, { status: 'idle' })
      }

      try {
        const stream = executeWorkflowStreaming(
          workflowData,
          workflowId,
          workflowName
        )

        for await (const event of stream) {
          handleStreamEvent(event)
        }

        // Return the final result
        return executionResult
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        setError(msg)
        resetNodes()
        throw err
      } finally {
        setIsExecuting(false)
        setCurrentNode(null)
      }
    },
    [storeNodes, updateNode, resetNodes, handleStreamEvent, executionResult]
  )

  const executeById = useCallback(
    async (workflowId: string) => {
      setIsExecuting(true)
      setError(null)
      setExecutionResult(null)
      setCurrentNode(null)
      resetNodes()

      for (const nodeId of Object.keys(storeNodes)) {
        updateNode(nodeId, { status: 'idle' })
      }

      try {
        const stream = executeWorkflowByIdStreaming(workflowId)

        for await (const event of stream) {
          handleStreamEvent(event)
        }

        return executionResult
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        setError(msg)
        resetNodes()
        throw err
      } finally {
        setIsExecuting(false)
        setCurrentNode(null)
      }
    },
    [storeNodes, updateNode, resetNodes, handleStreamEvent, executionResult]
  )

  const reset = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    setIsExecuting(false)
    setExecutionResult(null)
    setError(null)
    setCurrentNode(null)
    resetNodes()
  }, [resetNodes])

  return {
    execute,
    executeById,
    isExecuting,
    executionResult,
    error,
    currentNode,
    reset,
  }
}
