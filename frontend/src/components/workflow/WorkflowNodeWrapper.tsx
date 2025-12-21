'use client'

import React from 'react'
import { Handle, Position } from '@xyflow/react'
import { Play, Loader2, CheckCircle, XCircle } from 'lucide-react'
import { useWorkflowStore } from '@/lib/stores/workflowStore'
import { NodeConfig } from '@/types/workflow'

interface Props {
  nodeId: string
  config: NodeConfig
  onExecute: () => Promise<void>
  children?: React.ReactNode
}

export function WorkflowNodeWrapper({ nodeId, config, onExecute, children }: Props) {
  const node = useWorkflowStore(state => state.nodes[nodeId])
  
  const statusConfig = {
    idle: { icon: null, color: 'bg-gray-300', text: 'Ready' },
    running: { icon: Loader2, color: 'bg-blue-500', text: 'Running' },
    completed: { icon: CheckCircle, color: 'bg-green-500', text: 'Done' },
    error: { icon: XCircle, color: 'bg-red-500', text: 'Error' }
  }[node?.status || 'idle']
  
  const StatusIcon = statusConfig.icon
  
  return (
    <div className="bg-white rounded-lg shadow-lg border-2 border-gray-200 min-w-[320px]">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-500 to-purple-600 text-white px-4 py-2 rounded-t-lg">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">{config.label}</h3>
          <div className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs ${statusConfig.color}`}>
            {StatusIcon && <StatusIcon size={12} className={node?.status === 'running' ? 'animate-spin' : ''} />}
            <span>{statusConfig.text}</span>
          </div>
        </div>
        {config.description && (
          <p className="text-xs text-purple-100 mt-1">{config.description}</p>
        )}
      </div>
      
      {/* Input handles */}
      {config.inputs.map((input, idx) => (
        <Handle
          key={input.id}
          type="target"
          position={Position.Left}
          id={input.id}
          style={{ 
            top: `${((idx + 1) / (config.inputs.length + 1)) * 100}%`,
            background: '#8b5cf6'
          }}
        />
      ))}
      
      {/* Content */}
      <div className="p-4">
        {children}
        
        {node?.error && (
          <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
            {node.error}
          </div>
        )}
        
        <button
          onClick={onExecute}
          disabled={node?.status === 'running'}
          className="mt-4 w-full flex items-center justify-center gap-2 px-3 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm font-medium"
        >
          {node?.status === 'running' ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Running...
            </>
          ) : (
            <>
              <Play size={16} />
              Execute
            </>
          )}
        </button>
      </div>
      
      {/* Output handles */}
      {config.outputs.map((output, idx) => (
        <Handle
          key={output.id}
          type="source"
          position={Position.Right}
          id={output.id}
          style={{ 
            top: `${((idx + 1) / (config.outputs.length + 1)) * 100}%`,
            background: '#10b981'
          }}
        />
      ))}
    </div>
  )
}

