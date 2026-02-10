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
  persistence_warning?: string | null
}

export interface WorkflowErrorEvent {
  event: 'workflow_error'
  error: string
  total_execution_time_ms: number
  node_results?: NodeExecutionResult[]
  persistence_warning?: string | null
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

export interface WorkflowRunSummary {
  execution_id: string
  workflow_id: string
  success: boolean
  error: string | null
  total_execution_time_ms: number
  node_count: number
  nodes_completed: number
  nodes_errored: number
  created_at: string
  has_persisted_outputs: boolean
}

export interface BlueprintSnapshotNode {
  node_id?: string | null
  type?: string | null
}

export interface BlueprintSnapshot {
  nodes?: BlueprintSnapshotNode[] | null
}

export interface WorkflowRunOutputs {
  execution_id: string
  workflow_id: string
  node_outputs: Record<string, Record<string, unknown>>
  workflow_outputs: Record<string, unknown>
  blueprint_snapshot: BlueprintSnapshot | null
  payload_bytes: number
  created_at: string
}

// Preview drafts
export interface PreviewDraft {
  id: string
  workflow_id: string
  user_id: string
  execution_id: string | null
  name: string
  platform_id: string
  tone: string
  slot_content: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface PreviewDraftListItem {
  id: string
  name: string
  execution_id: string | null
  platform_id: string
  tone: string
  created_at: string
  updated_at: string
}

export interface CreateDraftRequest {
  name: string
  execution_id?: string | null
  platform_id?: string
  tone?: string
  slot_content?: Record<string, unknown>
}

export interface UpdateDraftRequest {
  name?: string
  tone?: string
  slot_content?: Record<string, unknown>
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
 * List persisted run history for a workflow.
 */
export async function listWorkflowRuns(
  workflowId: string
): Promise<WorkflowRunSummary[]> {
  return apiClient.request<WorkflowRunSummary[]>(
    `/v1/workflows/${workflowId}/runs`,
    {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    }
  )
}

/**
 * Get persisted outputs for a workflow run.
 */
export async function getWorkflowRunOutputs(
  workflowId: string,
  executionId: string
): Promise<WorkflowRunOutputs> {
  return apiClient.request<WorkflowRunOutputs>(
    `/v1/workflows/${workflowId}/runs/${executionId}/outputs`,
    {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    }
  )
}

/**
 * List preview drafts for a workflow.
 */
export async function listPreviewDrafts(
  workflowId: string
): Promise<PreviewDraftListItem[]> {
  return apiClient.request<PreviewDraftListItem[]>(
    `/v1/workflows/${workflowId}/drafts`,
    { method: 'GET', headers: { 'Content-Type': 'application/json' } }
  )
}

/**
 * Create a preview draft.
 */
export async function createPreviewDraft(
  workflowId: string,
  body: CreateDraftRequest
): Promise<PreviewDraft> {
  return apiClient.request<PreviewDraft>(
    `/v1/workflows/${workflowId}/drafts`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  )
}

/**
 * Get a single preview draft.
 */
export async function getPreviewDraft(
  workflowId: string,
  draftId: string
): Promise<PreviewDraft> {
  return apiClient.request<PreviewDraft>(
    `/v1/workflows/${workflowId}/drafts/${draftId}`,
    { method: 'GET', headers: { 'Content-Type': 'application/json' } }
  )
}

/**
 * Update a preview draft.
 */
export async function updatePreviewDraft(
  workflowId: string,
  draftId: string,
  body: UpdateDraftRequest
): Promise<PreviewDraft> {
  return apiClient.request<PreviewDraft>(
    `/v1/workflows/${workflowId}/drafts/${draftId}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  )
}

/**
 * Delete a preview draft.
 */
export async function deletePreviewDraft(
  workflowId: string,
  draftId: string
): Promise<void> {
  return apiClient.request<void>(
    `/v1/workflows/${workflowId}/drafts/${draftId}`,
    { method: 'DELETE' }
  )
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
 * Helper to get the base URL for SSE streaming requests.
 *
 * IMPORTANT: SSE streams MUST bypass the Next.js proxy (rewrites) because
 * Next.js buffers the entire response before forwarding it, which defeats
 * the purpose of streaming. This function returns a direct URL to the backend.
 */
function getStreamingBaseUrl(): string {
  // Check for explicit backend URL first
  const envUrl = process.env.NEXT_PUBLIC_BACKEND_URL
  if (envUrl) {
    const cleanUrl = envUrl.endsWith('/') ? envUrl.slice(0, -1) : envUrl
    return `${cleanUrl}/api`
  }

  // For local development, connect directly to the backend to bypass Next.js proxy buffering
  // The Next.js rewrite proxy buffers SSE streams, causing all events to arrive at once
  if (typeof window !== 'undefined') {
    // Client-side: use direct backend URL
    return 'http://127.0.0.1:8000/api'
  }

  // Server-side fallback (shouldn't be used for SSE, but just in case)
  return '/backend'
}

/**
 * Execute a workflow with SSE streaming using callbacks.
 * This approach ensures events are processed immediately as they arrive.
 * 
 * @param workflowData - The workflow data to execute
 * @param onEvent - Callback called for each SSE event as it arrives
 * @param workflowId - Optional workflow ID
 * @param workflowName - Optional workflow name
 * @returns Promise that resolves when the stream is complete
 */
export async function executeWorkflowStreamingWithCallback(
  workflowData: SavedWorkflowData,
  onEvent: (event: StreamingExecutionEvent) => void,
  workflowId?: string | null,
  workflowName?: string | null
): Promise<void> {
  // Get auth token
  const { data: { session } } = await supabase.auth.getSession()
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  }
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`
  }

  // Use direct backend URL to bypass Next.js proxy buffering
  const baseUrl = getStreamingBaseUrl()
  console.log('[SSE] Starting streaming request to:', `${baseUrl}/v1/workflows/execute/stream`)

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

  console.log('[SSE] Stream connected, waiting for events...')

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        console.log('[SSE] Stream ended')
        break
      }

      buffer += decoder.decode(value, { stream: true })

      // Parse SSE events from buffer - process each event IMMEDIATELY
      // Use regex to handle both \n and \r\n line endings (cross-platform)
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() || '' // Keep incomplete line in buffer

      for (const line of lines) {
        // Strip any remaining \r characters for cross-platform compatibility
        const cleanLine = line.replace(/\r/g, '')
        if (cleanLine.startsWith('data: ')) {
          const jsonStr = cleanLine.slice(6).trim()
          if (jsonStr) {
            try {
              const event = JSON.parse(jsonStr) as StreamingExecutionEvent
              console.log('[SSE] Event received:', event.event, event)
              // Call the callback immediately for each event
              onEvent(event)
            } catch (e) {
              console.warn('[SSE] Failed to parse SSE event:', jsonStr, e)
            }
          }
        }
      }
    }

    // Process any remaining data in buffer
    const cleanBuffer = buffer.replace(/\r/g, '')
    if (cleanBuffer.startsWith('data: ')) {
      const jsonStr = cleanBuffer.slice(6).trim()
      if (jsonStr) {
        try {
          const event = JSON.parse(jsonStr) as StreamingExecutionEvent
          console.log('[SSE] Final event from buffer:', event.event, event)
          onEvent(event)
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
 * Execute a saved workflow by ID with SSE streaming using callbacks.
 */
export async function executeWorkflowByIdStreamingWithCallback(
  workflowId: string,
  onEvent: (event: StreamingExecutionEvent) => void
): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession()
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  }
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`
  }

  // Use direct backend URL to bypass Next.js proxy buffering
  const baseUrl = getStreamingBaseUrl()
  console.log('[SSE] Starting streaming request to:', `${baseUrl}/v1/workflows/${workflowId}/execute/stream`)

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

  console.log('[SSE] Stream connected, waiting for events...')

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        console.log('[SSE] Stream ended')
        break
      }

      buffer += decoder.decode(value, { stream: true })

      // Use regex to handle both \n and \r\n line endings (cross-platform)
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() || ''

      for (const line of lines) {
        // Strip any remaining \r characters for cross-platform compatibility
        const cleanLine = line.replace(/\r/g, '')
        if (cleanLine.startsWith('data: ')) {
          const jsonStr = cleanLine.slice(6).trim()
          if (jsonStr) {
            try {
              const event = JSON.parse(jsonStr) as StreamingExecutionEvent
              console.log('[SSE] Event received:', event.event, event)
              onEvent(event)
            } catch (e) {
              console.warn('[SSE] Failed to parse SSE event:', jsonStr, e)
            }
          }
        }
      }
    }

    const cleanBuffer = buffer.replace(/\r/g, '')
    if (cleanBuffer.startsWith('data: ')) {
      const jsonStr = cleanBuffer.slice(6).trim()
      if (jsonStr) {
        try {
          const event = JSON.parse(jsonStr) as StreamingExecutionEvent
          console.log('[SSE] Final event from buffer:', event.event, event)
          onEvent(event)
        } catch {
          // Ignore
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

// Keep the old async generator versions for backwards compatibility
/**
 * @deprecated Use executeWorkflowStreamingWithCallback instead for real-time updates
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

  // Use direct backend URL to bypass Next.js proxy buffering
  const baseUrl = getStreamingBaseUrl()
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
      // Use regex to handle both \n and \r\n line endings (cross-platform)
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() || '' // Keep incomplete line in buffer

      for (const line of lines) {
        // Strip any remaining \r characters for cross-platform compatibility
        const cleanLine = line.replace(/\r/g, '')
        if (cleanLine.startsWith('data: ')) {
          const jsonStr = cleanLine.slice(6).trim()
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
    const cleanBuffer = buffer.replace(/\r/g, '')
    if (cleanBuffer.startsWith('data: ')) {
      const jsonStr = cleanBuffer.slice(6).trim()
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

  // Use direct backend URL to bypass Next.js proxy buffering
  const baseUrl = getStreamingBaseUrl()
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

      // Use regex to handle both \n and \r\n line endings (cross-platform)
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() || ''

      for (const line of lines) {
        // Strip any remaining \r characters for cross-platform compatibility
        const cleanLine = line.replace(/\r/g, '')
        if (cleanLine.startsWith('data: ')) {
          const jsonStr = cleanLine.slice(6).trim()
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

    const cleanBuffer = buffer.replace(/\r/g, '')
    if (cleanBuffer.startsWith('data: ')) {
      const jsonStr = cleanBuffer.slice(6).trim()
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
