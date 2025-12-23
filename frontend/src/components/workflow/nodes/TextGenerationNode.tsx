'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { NodeProps } from '@xyflow/react'
import { WorkflowNodeWrapper } from '../WorkflowNodeWrapper'
import { useWorkflowStore } from '@/lib/stores/workflowStore'
import { NodeConfig } from '@/types/workflow'
import { 
  getPresets, 
  generateText, 
  TextGenerationPreset,
  GenerateTextRequest 
} from '@/lib/fastapi/text-generation'
import { Plus, Settings } from 'lucide-react'
import { PresetManager } from './PresetManager'

// Config for this node type
const config: NodeConfig = {
  type: 'text-generation',
  label: 'Text Generation',
  description: 'Generate text using customizable presets',
  inputs: [
    { id: 'text', label: 'Text', type: 'string' }
  ],
  outputs: [
    { id: 'generated_text', label: 'Generated Text', type: 'json' }
  ]
}

export function TextGenerationNode({ id }: NodeProps) {
  // Get the node from the Zustand state manager
  const node = useWorkflowStore(state => state.nodes[id])
  const updateNode = useWorkflowStore(state => state.updateNode)

  // Initial state from node inputs
  const initialText = typeof node?.inputs?.text === 'string' ? node.inputs.text : ''
  const initialPresetId = typeof node?.inputs?.preset_id === 'string' ? node.inputs.preset_id : ''

  const [text, setText] = useState<string>(initialText)
  const [presets, setPresets] = useState<TextGenerationPreset[]>([])
  const [selectedPresetId, setSelectedPresetId] = useState<string>(initialPresetId)
  const [isLoadingPresets, setIsLoadingPresets] = useState(true)
  const [showPresetManager, setShowPresetManager] = useState(false)
  const [editingPreset, setEditingPreset] = useState<TextGenerationPreset | null>(null)
  const [generatedOutput, setGeneratedOutput] = useState<Record<string, unknown> | null>(null)

  const loadPresets = useCallback(async () => {
    try {
      setIsLoadingPresets(true)
      const loadedPresets = await getPresets()
      setPresets(loadedPresets)
      
      // If no preset selected and there are presets, select the first default or first one
      setSelectedPresetId((currentId) => {
        if (!currentId && loadedPresets.length > 0) {
          const defaultPreset = loadedPresets.find(p => p.is_default) || loadedPresets[0]
          return defaultPreset.id
        }
        return currentId
      })
    } catch (error) {
      console.error('Failed to load presets:', error)
    } finally {
      setIsLoadingPresets(false)
    }
  }, [])

  // Load presets on mount
  useEffect(() => {
    loadPresets()
  }, [loadPresets])

  // Sync inputs to Zustand store
  useEffect(() => {
    if (node && (node.inputs.text !== text || node.inputs.preset_id !== selectedPresetId)) {
      updateNode(id, {
        inputs: {
          ...node.inputs,
          text: text,
          preset_id: selectedPresetId
        }
      })
    }
  }, [text, selectedPresetId, id, updateNode, node])

  const handleCreatePreset = () => {
    setEditingPreset(null)
    setShowPresetManager(true)
  }

  const handleEditPreset = (preset: TextGenerationPreset) => {
    setEditingPreset(preset)
    setShowPresetManager(true)
  }

  const handlePresetSaved = () => {
    setShowPresetManager(false)
    setEditingPreset(null)
    loadPresets() // Reload presets after save
  }

  const handleExecute = async () => {
    if (!selectedPresetId) {
      updateNode(id, { status: 'error', error: 'Please select a preset' })
      return
    }

    if (!text.trim()) {
      updateNode(id, { status: 'error', error: 'Please enter input text' })
      return
    }

    updateNode(id, { status: 'running', error: undefined })
    setGeneratedOutput(null)

    try {
      const request: GenerateTextRequest = {
        input_text: text,
        preset_id: selectedPresetId
      }

      const response = await generateText(request)

      if (!response.success) {
        throw new Error(response.error || 'Generation failed')
      }

      setGeneratedOutput(response.output)

      // Update node with results
      updateNode(id, {
        status: 'completed',
        outputs: { generated_text: response.output },
        inputs: { text, preset_id: selectedPresetId }
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
      updateNode(id, { status: 'error', error: errorMessage })
    }
  }

  const selectedPreset = presets.find(p => p.id === selectedPresetId)

  return (
    <>
      <WorkflowNodeWrapper nodeId={id} config={config} onExecute={handleExecute}>
        <div className="space-y-3">
          {/* Text input */}
          <div>
            <label className="text-xs text-gray-600 block mb-1">Input Text</label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Enter text to generate from..."
              className="nodrag w-full px-2 py-1.5 text-sm border rounded resize-none"
              rows={4}
            />
          </div>

          {/* Preset selector */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-gray-600">Preset</label>
              <button
                onClick={handleCreatePreset}
                className="nodrag flex items-center gap-1 text-xs text-purple-600 hover:text-purple-700"
                title="Create new preset"
              >
                <Plus size={12} />
                New
              </button>
            </div>
            {isLoadingPresets ? (
              <div className="text-xs text-gray-500 py-2">Loading presets...</div>
            ) : (
              <div className="flex gap-2">
                <select
                  value={selectedPresetId}
                  onChange={(e) => setSelectedPresetId(e.target.value)}
                  className="nodrag flex-1 px-2 py-1.5 text-sm border rounded"
                >
                  <option value="">Select a preset...</option>
                  {presets.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.name} {preset.is_default && '(Default)'}
                    </option>
                  ))}
                </select>
                {selectedPreset && (
                  <button
                    onClick={() => handleEditPreset(selectedPreset)}
                    className="nodrag px-2 py-1.5 text-sm border rounded hover:bg-gray-50"
                    title="Edit preset"
                  >
                    <Settings size={14} />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Preset info */}
          {selectedPreset && (
            <div className="text-xs text-gray-500 space-y-1">
              {selectedPreset.max_length && (
                <div>Max length: {selectedPreset.max_length} characters</div>
              )}
              {selectedPreset.tone_guidance && (
                <div>Tone: {selectedPreset.tone_guidance}</div>
              )}
            </div>
          )}

          {/* Generated output display */}
          {generatedOutput && node?.status === 'completed' && (
            <div className="mt-3 p-2 bg-gray-50 border rounded text-xs">
              <div className="font-semibold mb-1">Generated Output:</div>
              <pre className="whitespace-pre-wrap text-xs">
                {JSON.stringify(generatedOutput, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </WorkflowNodeWrapper>

      {/* Preset Manager Modal */}
      {showPresetManager && (
        <PresetManager
          preset={editingPreset}
          onSave={handlePresetSaved}
          onCancel={() => {
            setShowPresetManager(false)
            setEditingPreset(null)
          }}
        />
      )}
    </>
  )
}

