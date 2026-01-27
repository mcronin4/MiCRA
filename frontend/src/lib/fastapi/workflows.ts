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
