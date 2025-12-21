'use client'

import React, { useState } from 'react'
import { NodeProps } from '@xyflow/react'
import { WorkflowNodeWrapper } from '../WorkflowNodeWrapper'
import { useWorkflowStore } from '@/lib/stores/workflowStore'
import { matchImagesToText, fileToBase64 } from '@/lib/fastapi/image-matching'
import { NodeConfig } from '@/types/workflow'
import { X } from 'lucide-react'

// Config for this node type
const config: NodeConfig = {
  type: 'image-matching',
  label: 'Image-Text Matching',
  description: 'Match images with text using VLM',
  inputs: [
    { id: 'images', label: 'Images', type: 'image[]' },
    { id: 'text', label: 'Text', type: 'string' }
  ],
  outputs: [
    { id: 'matches', label: 'Results', type: 'json' }
  ]
}

export function ImageMatchingNode({ id }: NodeProps) {
  const [text, setText] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  
  const updateNode = useWorkflowStore(state => state.updateNode)
  const node = useWorkflowStore(state => state.nodes[id])
  
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFiles = Array.from(e.target.files || [])
    setFiles(prev => [...prev, ...newFiles])
    
    const newPreviews = await Promise.all(newFiles.map(f => fileToBase64(f)))
    setPreviews(prev => [...prev, ...newPreviews])
  }
  
  const removeImage = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index))
    setPreviews(prev => prev.filter((_, i) => i !== index))
  }
  
  const handleExecute = async () => {
    updateNode(id, { status: 'running', error: undefined })
    
    try {
      if (files.length === 0) throw new Error('No images uploaded')
      if (!text.trim()) throw new Error('No text entered')
      
      // Convert files to base64
      const base64Images = await Promise.all(files.map(f => fileToBase64(f)))
      
      // Call API
      const response = await matchImagesToText(base64Images, text)
      
      if (!response.success) {
        throw new Error(response.error || 'Matching failed')
      }
      
      // Update node
      updateNode(id, { 
        status: 'completed',
        outputs: { matches: response.matches },
        inputs: { images: base64Images, text }
      })
    } catch (error: any) {
      updateNode(id, { status: 'error', error: error.message })
    }
  }
  
  return (
    <WorkflowNodeWrapper nodeId={id} config={config} onExecute={handleExecute}>
      <div className="space-y-3">
        {/* Text input */}
        <div>
          <label className="text-xs text-gray-600 block mb-1">Text Description</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Enter text to match..."
            className="w-full px-2 py-1.5 text-sm border rounded resize-none"
            rows={3}
          />
        </div>
        
        {/* Image upload */}
        <div>
          <label className="text-xs text-gray-600 block mb-1">
            Images ({files.length})
          </label>
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={handleImageUpload}
            className="w-full text-xs"
          />
        </div>
        
        {/* Previews */}
        {previews.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {previews.map((preview, idx) => (
              <div key={idx} className="relative group">
                <img 
                  src={preview} 
                  alt={`Preview ${idx + 1}`}
                  className="w-full h-16 object-cover rounded border"
                />
                <button
                  onClick={() => removeImage(idx)}
                  className="absolute top-0 right-0 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
        
        {/* Results */}
        {node?.outputs?.matches && (
          <div className="p-2 bg-green-50 border border-green-200 rounded">
            <p className="text-xs font-semibold text-green-800 mb-1">Results:</p>
            {node.outputs.matches.map((match: any, idx: number) => (
              <div key={idx} className="text-xs text-green-700">
                Image {idx + 1}: {(match.score * 100).toFixed(1)}% match
              </div>
            ))}
          </div>
        )}
      </div>
    </WorkflowNodeWrapper>
  )
}

