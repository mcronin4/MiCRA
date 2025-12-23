'use client'

import React, { useState, useEffect } from 'react'
import { 
  createPreset, 
  updatePreset, 
  TextGenerationPreset,
  CreatePresetRequest,
  UpdatePresetRequest 
} from '@/lib/fastapi/text-generation'
import { X, Save } from 'lucide-react'

interface PresetManagerProps {
  preset: TextGenerationPreset | null
  onSave: () => void
  onCancel: () => void
}

export function PresetManager({ preset, onSave, onCancel }: PresetManagerProps) {
  const [name, setName] = useState('')
  const [prompt, setPrompt] = useState('')
  const [maxLength, setMaxLength] = useState<number | ''>('')
  const [toneGuidance, setToneGuidance] = useState('')
  const [structureTemplate, setStructureTemplate] = useState('')
  const [outputLimit, setOutputLimit] = useState<number | ''>('')
  const [outputFormatJson, setOutputFormatJson] = useState('{}')
  const [isDefault, setIsDefault] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Initialize form with preset data if editing
  useEffect(() => {
    if (preset) {
      setName(preset.name)
      setPrompt(preset.prompt)
      setMaxLength(preset.max_length || '')
      setToneGuidance(preset.tone_guidance || '')
      setStructureTemplate(preset.structure_template || '')
      setOutputLimit(preset.output_limit || '')
      setOutputFormatJson(JSON.stringify(preset.output_format || {}, null, 2))
      setIsDefault(preset.is_default || false)
    } else {
      // Reset form for new preset
      setName('')
      setPrompt('')
      setMaxLength('')
      setToneGuidance('')
      setStructureTemplate('')
      setOutputLimit('')
      setOutputFormatJson('{}')
      setIsDefault(false)
    }
  }, [preset])

  const validateOutputFormat = (): Record<string, any> | null => {
    try {
      const parsed = JSON.parse(outputFormatJson)
      if (typeof parsed !== 'object' || Array.isArray(parsed)) {
        setError('Output format must be a JSON object')
        return null
      }
      return parsed
    } catch (e) {
      setError('Invalid JSON format')
      return null
    }
  }

  const handleSave = async () => {
    setError(null)

    if (!name.trim()) {
      setError('Name is required')
      return
    }

    if (!prompt.trim()) {
      setError('Prompt is required')
      return
    }

    const outputFormat = validateOutputFormat()
    if (outputFormat === null) {
      return
    }

    setIsSaving(true)

    try {
      if (preset) {
        // Update existing preset
        const updateData: UpdatePresetRequest = {
          name: name.trim(),
          prompt: prompt.trim(),
          max_length: maxLength !== '' ? Number(maxLength) : undefined,
          tone_guidance: toneGuidance.trim() || undefined,
          structure_template: structureTemplate.trim() || undefined,
          output_limit: outputLimit !== '' ? Number(outputLimit) : undefined,
          output_format: Object.keys(outputFormat).length > 0 ? outputFormat : undefined,
          is_default: isDefault
        }
        await updatePreset(preset.id, updateData)
      } else {
        // Create new preset
        const createData: CreatePresetRequest = {
          name: name.trim(),
          prompt: prompt.trim(),
          max_length: maxLength !== '' ? Number(maxLength) : undefined,
          tone_guidance: toneGuidance.trim() || undefined,
          structure_template: structureTemplate.trim() || undefined,
          output_limit: outputLimit !== '' ? Number(outputLimit) : undefined,
          output_format: Object.keys(outputFormat).length > 0 ? outputFormat : undefined,
          is_default: isDefault
        }
        await createPreset(createData)
      }

      onSave()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save preset')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">
            {preset ? 'Edit Preset' : 'Create New Preset'}
          </h2>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {error && (
            <div className="p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., LinkedIn Post"
              className="w-full px-3 py-2 border rounded text-sm"
            />
          </div>

          {/* Prompt */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Prompt Template <span className="text-red-500">*</span>
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Enter prompt template. Use {source_context} and {tone_guidance} as placeholders."
              className="w-full px-3 py-2 border rounded text-sm font-mono"
              rows={8}
            />
            <p className="text-xs text-gray-500 mt-1">
              Use {'{source_context}'} for source text and {'{tone_guidance}'} for tone instructions
            </p>
          </div>

          {/* Max Length */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Max Length (characters)
            </label>
            <input
              type="number"
              value={maxLength}
              onChange={(e) => setMaxLength(e.target.value === '' ? '' : Number(e.target.value))}
              placeholder="e.g., 1200"
              className="w-full px-3 py-2 border rounded text-sm"
              min="1"
            />
          </div>

          {/* Tone Guidance */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tone Guidance
            </label>
            <input
              type="text"
              value={toneGuidance}
              onChange={(e) => setToneGuidance(e.target.value)}
              placeholder="e.g., professional yet conversational"
              className="w-full px-3 py-2 border rounded text-sm"
            />
          </div>

          {/* Structure Template */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Structure Template
            </label>
            <textarea
              value={structureTemplate}
              onChange={(e) => setStructureTemplate(e.target.value)}
              placeholder="e.g., Hook, Body, CTA"
              className="w-full px-3 py-2 border rounded text-sm"
              rows={3}
            />
          </div>

          {/* Output Limit */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Output Limit
            </label>
            <input
              type="number"
              value={outputLimit}
              onChange={(e) => setOutputLimit(e.target.value === '' ? '' : Number(e.target.value))}
              placeholder="e.g., 1000"
              className="w-full px-3 py-2 border rounded text-sm"
              min="1"
            />
          </div>

          {/* Output Format (JSON Schema) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Output Format (JSON Schema)
            </label>
            <textarea
              value={outputFormatJson}
              onChange={(e) => {
                setOutputFormatJson(e.target.value)
                setError(null)
              }}
              placeholder='{"type": "object", "properties": {...}}'
              className="w-full px-3 py-2 border rounded text-sm font-mono"
              rows={6}
            />
            <p className="text-xs text-gray-500 mt-1">
              JSON schema defining the output structure. Leave as {'{}'} for plain text output.
            </p>
          </div>

          {/* Is Default */}
          <div className="flex items-center">
            <input
              type="checkbox"
              id="isDefault"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="mr-2"
            />
            <label htmlFor="isDefault" className="text-sm text-gray-700">
              Set as default preset
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 border-t">
          <button
            onClick={onCancel}
            disabled={isSaving}
            className="px-4 py-2 text-sm border rounded hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 text-sm bg-purple-500 text-white rounded hover:bg-purple-600 disabled:opacity-50 flex items-center gap-2"
          >
            <Save size={16} />
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

