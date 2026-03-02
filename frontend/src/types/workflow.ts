export interface NodePort {
  id: string
  label: string
  type: 'string' | 'file' | 'image' | 'image[]'
}

export interface NodeConfig {
  type: string
  label: string
  description?: string
  inputs: NodePort[]
  outputs: NodePort[]
}

