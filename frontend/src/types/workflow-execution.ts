export interface NodeExecutionResult {
  node_id: string
  node_type: string | null
  status: 'completed' | 'error'
  outputs: Record<string, unknown> | null
  error: string | null
  execution_time_ms: number
}

export interface WorkflowExecutionResult {
  success: boolean
  workflow_outputs: Record<string, unknown>
  node_results: NodeExecutionResult[]
  total_execution_time_ms: number
  error: string | null
}

export interface ExecutionLogSummary {
  id: string
  workflow_id: string
  success: boolean
  error: string | null
  total_execution_time_ms: number
  node_count: number
  nodes_completed: number
  nodes_errored: number
  created_at: string
}

export interface ExecutionLogDetail extends ExecutionLogSummary {
  node_summaries: {
    node_id: string
    status: 'completed' | 'error'
    error: string | null
    execution_time_ms: number
  }[]
}
