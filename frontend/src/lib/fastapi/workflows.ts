/**
 * Workflow persistence API client.
 * 
 * NOTE: This system only saves workflow structure (nodes, edges, positions).
 * Node inputs/outputs, attachments (e.g., base64 images), and execution state
 * are NOT persisted. All workflows load with nodes in 'idle' state with empty inputs.
 * 
 * In prototype mode: all workflows are accessible to all users.
 * System workflows cannot be deleted or updated.
 */

import { apiClient } from './client'
import { supabase } from '@/lib/supabase/client'
import type { CompilationResult } from '@/types/blueprint'
import type { WorkflowExecutionResult, NodeExecutionResult } from '@/types/workflow-execution'

// SSE Event types for streaming execution
export interface WorkflowStartEvent {
  event: 'workflow_start'
  execution_order: string[]
  total_nodes: number
}

export interface NodeStartEvent {
  event: 'node_start'
  node_id: string
  node_type: string
}

export interface NodeCompleteEvent {
  event: 'node_complete'
  node_id: string
  status: 'completed'
  outputs: Record<string, unknown>
  execution_time_ms: number
}

export interface NodeErrorEvent {
  event: 'node_error'
  node_id: string
  error: string
  execution_time_ms: number
}

export interface WorkflowCompleteEvent {
  event: 'workflow_complete'
  success: true
  workflow_outputs: Record<string, unknown>
  total_execution_time_ms: number
  node_results: NodeExecutionResult[]
}

export interface WorkflowErrorEvent {
  event: 'workflow_error'
  error: string
  total_execution_time_ms: number
  node_results?: NodeExecutionResult[]
}

export type StreamingExecutionEvent =
  | WorkflowStartEvent
  | NodeStartEvent
  | NodeCompleteEvent
  | NodeErrorEvent
  | WorkflowCompleteEvent
  | WorkflowErrorEvent

export interface SavedWorkflowNode {
  id: string
  type: string
  position: { x: number; y: number }
  data?: {
    label?: string
    [key: string]: unknown
  }
  [key: string]: unknown // Allow other ReactFlow node properties
}

export interface SavedWorkflowEdge {
  id: string
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
  [key: string]: unknown // Allow other ReactFlow edge properties
}

export interface SavedWorkflowData {
  nodes: SavedWorkflowNode[]
  edges: SavedWorkflowEdge[]
}

export interface WorkflowMetadata {
  id: string
  name: string
  description: string | null
  user_id: string
  is_system: boolean
  node_count: number
  edge_count: number
  created_at: string
  updated_at: string
}

export interface Workflow {
  id: string
  name: string
  description: string | null
  user_id: string
  is_system: boolean
  workflow_data: SavedWorkflowData
  created_at: string
  updated_at: string
}

export interface CreateWorkflowRequest {
  name: string
  description?: string
  workflow_data: SavedWorkflowData
  is_system?: boolean
}

export interface UpdateWorkflowRequest {
  name?: string
  description?: string
  workflow_data?: SavedWorkflowData
}

export interface WorkflowVersionMetadata {
  version_number: number
  created_at: string
  node_count: number
  edge_count: number
}

export interface WorkflowVersion {
  version_number: number
  workflow_id: string
  workflow_data: SavedWorkflowData
  created_at: string
}

/**
 * List all workflows accessible to the user (user workflows + system templates).
 * Returns only metadata (no payload) for efficient listing.
 */
export async function listWorkflows(): Promise<WorkflowMetadata[]> {
  return apiClient.request<WorkflowMetadata[]>('/v1/workflows', {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  })
}

/**
 * List only pre-built system workflow templates.
 * Returns only metadata (no payload) for efficient listing.
 */
export async function listTemplates(): Promise<WorkflowMetadata[]> {
  return apiClient.request<WorkflowMetadata[]>('/v1/workflows/templates', {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  })
}

/**
 * Get a specific workflow by ID.
 */
export async function getWorkflow(workflowId: string): Promise<Workflow> {
  return apiClient.request<Workflow>(`/v1/workflows/${workflowId}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  })
}

/**
 * Create a new workflow.
 */
export async function createWorkflow(
  workflow: CreateWorkflowRequest
): Promise<Workflow> {
  return apiClient.request<Workflow>('/v1/workflows', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(workflow),
  })
}

/**
 * Update an existing workflow.
 * Cannot update system workflows.
 */
export async function updateWorkflow(
  workflowId: string,
  workflow: UpdateWorkflowRequest
): Promise<Workflow> {
  return apiClient.request<Workflow>(`/v1/workflows/${workflowId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(workflow),
  })
}

/**
 * Delete a workflow.
 * Cannot delete system workflows.
 */
export async function deleteWorkflow(workflowId: string): Promise<void> {
  return apiClient.request<void>(`/v1/workflows/${workflowId}`, {
    method: 'DELETE',
  })
}

/**
 * List all versions for a workflow.
 * Returns version metadata without full payload.
 */
export async function listWorkflowVersions(
  workflowId: string
): Promise<WorkflowVersionMetadata[]> {
  return apiClient.request<WorkflowVersionMetadata[]>(
    `/v1/workflows/${workflowId}/versions`,
    {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    }
  )
}

/**
 * Get a specific version of a workflow.
 * Returns the full workflow data for that version.
 */
export async function getWorkflowVersion(
  workflowId: string,
  versionNumber: number
): Promise<WorkflowVersion> {
  return apiClient.request<WorkflowVersion>(
    `/v1/workflows/${workflowId}/versions/${versionNumber}`,
    {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    }
  )
}

/**
 * Compile a raw (unsaved) workflow into a Blueprint.
 */
export async function compileWorkflow(
  workflowData: SavedWorkflowData
): Promise<CompilationResult> {
  try {
    return await apiClient.request<CompilationResult>('/v1/workflows/compile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(workflowData),
    })
  } catch (err: unknown) {
    // Handle 422 compilation errors - extract diagnostics from error response
    if (err instanceof Error && 'status' in err && (err as { status: number }).status === 422) {
      // Check if error has a detail property with diagnostics
      const errorWithDetail = err as { detail?: { diagnostics?: unknown[]; message?: string } }
      if (errorWithDetail.detail?.diagnostics) {
        return {
          success: false,
          blueprint: null,
          diagnostics: errorWithDetail.detail.diagnostics as CompilationResult['diagnostics'],
        }
      }
      // Try parsing the error message as JSON (it might be stringified)
      try {
        const parsed = JSON.parse(err.message)
        if (parsed.diagnostics && Array.isArray(parsed.diagnostics)) {
          return {
            success: false,
            blueprint: null,
            diagnostics: parsed.diagnostics,
          }
        }
      } catch {
        // Not JSON, continue to throw original error
      }
    }
    throw err
  }
}

/**
 * Compile a saved workflow by ID (uses latest version).
 */
export async function compileWorkflowById(
  workflowId: string
): Promise<CompilationResult> {
  return apiClient.request<CompilationResult>(
    `/v1/workflows/${workflowId}/compile`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }
  )
}

/**
 * Execute a raw (unsaved) workflow.
 */
export async function executeWorkflow(
  workflowData: SavedWorkflowData,
  workflowId?: string | null,
  workflowName?: string | null
): Promise<WorkflowExecutionResult> {
  return apiClient.request<WorkflowExecutionResult>('/v1/workflows/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nodes: workflowData.nodes,
      edges: workflowData.edges,
      workflow_id: workflowId || null,
      workflow_name: workflowName || null,
    }),
  })
}

/**
 * Execute a saved workflow by ID (uses latest version).
 */
export async function executeWorkflowById(
  workflowId: string
): Promise<WorkflowExecutionResult> {
  return apiClient.request<WorkflowExecutionResult>(
    `/v1/workflows/${workflowId}/execute`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }
  )
}

/**
 * Helper to get the base URL for API requests.
 */
function getBaseUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_BACKEND_URL
  if (envUrl) {
    const cleanUrl = envUrl.endsWith('/') ? envUrl.slice(0, -1) : envUrl
    return `${cleanUrl}/api`
  }
  return '/backend'
}

/**
 * Execute a workflow with SSE streaming.
 * Returns an async generator that yields events as each node executes.
 */
export async function* executeWorkflowStreaming(
  workflowData: SavedWorkflowData,
  workflowId?: string | null,
  workflowName?: string | null
): AsyncGenerator<StreamingExecutionEvent, void, unknown> {
  // Get auth token
  const { data: { session } } = await supabase.auth.getSession()
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  }
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`
  }

  const baseUrl = getBaseUrl()
  const response = await fetch(`${baseUrl}/v1/workflows/execute/stream`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      nodes: workflowData.nodes,
      edges: workflowData.edges,
      workflow_id: workflowId || null,
      workflow_name: workflowName || null,
    }),
  })

  if (!response.ok) {
    let errorMessage = `HTTP error! status: ${response.status}`
    try {
      const errorData = await response.json()
      if (errorData.detail) {
        errorMessage = typeof errorData.detail === 'object'
          ? JSON.stringify(errorData.detail)
          : String(errorData.detail)
      }
    } catch {
      // Use default error message
    }
    throw new Error(errorMessage)
  }

  if (!response.body) {
    throw new Error('No response body')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      // Parse SSE events from buffer
      const lines = buffer.split('\n')
      buffer = lines.pop() || '' // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const jsonStr = line.slice(6).trim()
          if (jsonStr) {
            try {
              const event = JSON.parse(jsonStr) as StreamingExecutionEvent
              yield event
            } catch (e) {
              console.warn('Failed to parse SSE event:', jsonStr, e)
            }
          }
        }
      }
    }

    // Process any remaining data in buffer
    if (buffer.startsWith('data: ')) {
      const jsonStr = buffer.slice(6).trim()
      if (jsonStr) {
        try {
          const event = JSON.parse(jsonStr) as StreamingExecutionEvent
          yield event
        } catch {
          // Ignore incomplete final event
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

/**
 * Execute a saved workflow by ID with SSE streaming.
 */
export async function* executeWorkflowByIdStreaming(
  workflowId: string
): AsyncGenerator<StreamingExecutionEvent, void, unknown> {
  const { data: { session } } = await supabase.auth.getSession()
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  }
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`
  }

  const baseUrl = getBaseUrl()
  const response = await fetch(`${baseUrl}/v1/workflows/${workflowId}/execute/stream`, {
    method: 'POST',
    headers,
    body: JSON.stringify({}),
  })

  if (!response.ok) {
    let errorMessage = `HTTP error! status: ${response.status}`
    try {
      const errorData = await response.json()
      if (errorData.detail) {
        errorMessage = typeof errorData.detail === 'object'
          ? JSON.stringify(errorData.detail)
          : String(errorData.detail)
      }
    } catch {
      // Use default error message
    }
    throw new Error(errorMessage)
  }

  if (!response.body) {
    throw new Error('No response body')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const jsonStr = line.slice(6).trim()
          if (jsonStr) {
            try {
              const event = JSON.parse(jsonStr) as StreamingExecutionEvent
              yield event
            } catch (e) {
              console.warn('Failed to parse SSE event:', jsonStr, e)
            }
          }
        }
      }
    }

    if (buffer.startsWith('data: ')) {
      const jsonStr = buffer.slice(6).trim()
      if (jsonStr) {
        try {
          const event = JSON.parse(jsonStr) as StreamingExecutionEvent
          yield event
        } catch {
          // Ignore
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}
