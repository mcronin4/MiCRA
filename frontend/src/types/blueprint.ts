/**
 * Blueprint types — TypeScript mirrors of the backend Blueprint models.
 * Used for display/inspection of compiled workflows.
 */

export type RuntimeType = 'Text' | 'ImageRef' | 'VideoRef' | 'AudioRef' | 'JSON'
export type RuntimeShape = 'single' | 'list' | 'map'

export interface PortSchema {
  key: string
  runtime_type: RuntimeType
  shape: RuntimeShape
  required: boolean
}

export interface BlueprintNode {
  node_id: string
  type: string
  implementation: string | null
  params: Record<string, unknown>
  inputs_schema: PortSchema[]
  outputs_schema: PortSchema[]
  runtime_hints: Record<string, unknown> | null
}

export interface BlueprintConnection {
  from_node: string
  from_output: string
  to_node: string
  to_input: string
}

export interface WorkflowInput {
  key: string
  runtime_type: RuntimeType
  shape: RuntimeShape
}

export interface WorkflowOutput {
  key: string
  from_node: string
  from_output: string
}

export interface Blueprint {
  workflow_id: string | null
  version: number | null
  engine_version: string
  name: string
  description: string | null
  created_at: string
  created_by: string | null
  nodes: BlueprintNode[]
  connections: BlueprintConnection[]
  workflow_inputs: WorkflowInput[]
  workflow_outputs: WorkflowOutput[]
  execution_order: string[]
}

export interface CompilationDiagnostic {
  level: 'error' | 'warning'
  message: string
  node_id: string | null
  field: string | null
}

export interface CompilationResult {
  success: boolean
  blueprint: Blueprint | null
  diagnostics: CompilationDiagnostic[]
}
