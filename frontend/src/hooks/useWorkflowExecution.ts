import { useState, useCallback, useRef } from 'react'
import { useWorkflowStore } from '@/lib/stores/workflowStore'
import {
  executeWorkflowStreamingWithCallback,
  executeWorkflowByIdStreamingWithCallback,
} from '@/lib/fastapi/workflows'
import type { SavedWorkflowData, StreamingExecutionEvent } from '@/lib/fastapi/workflows'
import type { WorkflowExecutionResult } from '@/types/workflow-execution'

export function useWorkflowExecution() {
  const [isExecuting, setIsExecuting] = useState(false)
  const [executionResult, setExecutionResult] =
    useState<WorkflowExecutionResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [currentNode, setCurrentNode] = useState<string | null>(null)
  // TODO: Wire up AbortController to support cancelling a running workflow.
  // Currently unused — execute/executeById don't assign it or pass a signal.
  const abortControllerRef = useRef<AbortController | null>(null)
  // Track nodes that just completed for animation purposes
  const justCompletedRef = useRef<Set<string>>(new Set())

  const updateNode = useWorkflowStore((s) => s.updateNode)

  const resetNodes = useCallback(() => {
    const currentNodes = useWorkflowStore.getState().nodes
    for (const nodeId of Object.keys(currentNodes)) {
      updateNode(nodeId, { status: 'idle', outputs: null, error: undefined })
    }
  }, [updateNode])

  // Ref to store the final result (updated by event handler)
  const finalResultRef = useRef<WorkflowExecutionResult | null>(null)

  const handleStreamEvent = useCallback(
    (event: StreamingExecutionEvent) => {
      // Process events immediately - Zustand updates are synchronous
      // and will trigger React re-renders through subscriptions
      switch (event.event) {
        case 'workflow_start':
          // Mark all nodes in execution order as "pending" (ready to run)
          console.log('[SSE] workflow_start - setting nodes to pending:', event.execution_order)
          for (const nodeId of event.execution_order) {
            updateNode(nodeId, { status: 'pending', error: undefined })
          }
          break

        case 'node_start':
          console.log('[SSE] node_start:', event.node_id)
          setCurrentNode(event.node_id)
          updateNode(event.node_id, { status: 'running', error: undefined })
          break

        case 'node_complete':
          console.log('[SSE] node_complete:', event.node_id)
          // Track that this node just completed (for animation)
          justCompletedRef.current.add(event.node_id)
          // Clear the "just completed" flag after animation duration
          setTimeout(() => {
            justCompletedRef.current.delete(event.node_id)
          }, 600) // Match animation duration

          updateNode(event.node_id, {
            status: 'completed',
            outputs: event.outputs,
            error: undefined,
          })
          break

        case 'node_error':
          console.log('[SSE] node_error:', event.node_id, event.error)
          updateNode(event.node_id, {
            status: 'error',
            error: event.error,
          })
          break

        case 'workflow_complete':
          console.log('[SSE] workflow_complete')
          finalResultRef.current = {
            success: true,
            workflow_outputs: event.workflow_outputs,
            node_results: event.node_results,
            total_execution_time_ms: event.total_execution_time_ms,
            error: null,
            persistence_warning: event.persistence_warning ?? null,
          }
          setExecutionResult(finalResultRef.current)
          setCurrentNode(null)
          break

        case 'workflow_error':
          console.log('[SSE] workflow_error:', event.error)
          setError(event.error)
          if (event.node_results) {
            finalResultRef.current = {
              success: false,
              workflow_outputs: {},
              node_results: event.node_results,
              total_execution_time_ms: event.total_execution_time_ms,
              error: event.error,
              persistence_warning: event.persistence_warning ?? null,
            }
            setExecutionResult(finalResultRef.current)
          }
          setCurrentNode(null)
          break
      }
    },
    [updateNode]
  )

  const execute = useCallback(
    async (
      workflowData: SavedWorkflowData,
      workflowId?: string | null,
      workflowName?: string | null
    ): Promise<WorkflowExecutionResult | null> => {
      setIsExecuting(true)
      setError(null)
      setExecutionResult(null)
      setCurrentNode(null)
      finalResultRef.current = null
      resetNodes()

      console.log('[Execute] Starting workflow execution...')

      try {
        // Use callback-based streaming for immediate event processing
        await executeWorkflowStreamingWithCallback(
          workflowData,
          handleStreamEvent,
          workflowId,
          workflowName
        )

        console.log('[Execute] Stream complete, final result:', finalResultRef.current)
        // Return the final result captured by the event handler
        return finalResultRef.current
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error('[Execute] Error:', msg)
        setError(msg)
        resetNodes()
        throw err
      } finally {
        setIsExecuting(false)
        setCurrentNode(null)
      }
    },
    [resetNodes, handleStreamEvent]
  )

  const executeById = useCallback(
    async (workflowId: string): Promise<WorkflowExecutionResult | null> => {
      setIsExecuting(true)
      setError(null)
      setExecutionResult(null)
      setCurrentNode(null)
      finalResultRef.current = null
      resetNodes()

      console.log('[ExecuteById] Starting workflow execution...')

      try {
        // Use callback-based streaming for immediate event processing
        await executeWorkflowByIdStreamingWithCallback(
          workflowId,
          handleStreamEvent
        )

        console.log('[ExecuteById] Stream complete, final result:', finalResultRef.current)
        return finalResultRef.current
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error('[ExecuteById] Error:', msg)
        setError(msg)
        resetNodes()
        throw err
      } finally {
        setIsExecuting(false)
        setCurrentNode(null)
      }
    },
    [resetNodes, handleStreamEvent]
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
