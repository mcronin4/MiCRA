import { apiClient } from './client'

export interface TextGenerationPreset {
  id: string
  name: string
  prompt: string
  output_format?: Record<string, any>
  max_length?: number
  tone_guidance?: string
  structure_template?: string
  output_limit?: number
  is_default: boolean
  created_at: string
  updated_at: string
}

export interface CreatePresetRequest {
  name: string
  prompt: string
  output_format?: Record<string, any>
  max_length?: number
  tone_guidance?: string
  structure_template?: string
  output_limit?: number
  is_default?: boolean
}

export interface UpdatePresetRequest {
  name?: string
  prompt?: string
  output_format?: Record<string, any>
  max_length?: number
  tone_guidance?: string
  structure_template?: string
  output_limit?: number
  is_default?: boolean
}

export interface GenerateTextRequest {
  input_text: string
  preset_id: string
  source_texts?: Array<{ title?: string; content: string }>
}

export interface GenerateTextResponse {
  success: boolean
  output: Record<string, any>
  error?: string
}

/**
 * Fetch all text generation presets
 */
export async function getPresets(): Promise<TextGenerationPreset[]> {
  return apiClient.request<TextGenerationPreset[]>('/v1/text-generation/presets', {
    method: 'GET'
  })
}

/**
 * Fetch a single preset by ID
 */
export async function getPreset(presetId: string): Promise<TextGenerationPreset> {
  return apiClient.request<TextGenerationPreset>(`/v1/text-generation/presets/${presetId}`, {
    method: 'GET'
  })
}

/**
 * Create a new preset
 */
export async function createPreset(data: CreatePresetRequest): Promise<TextGenerationPreset> {
  return apiClient.request<TextGenerationPreset>('/v1/text-generation/presets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
}

/**
 * Update an existing preset
 */
export async function updatePreset(
  presetId: string,
  data: UpdatePresetRequest
): Promise<TextGenerationPreset> {
  return apiClient.request<TextGenerationPreset>(`/v1/text-generation/presets/${presetId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
}

/**
 * Delete a preset
 */
export async function deletePreset(presetId: string): Promise<void> {
  return apiClient.request<void>(`/v1/text-generation/presets/${presetId}`, {
    method: 'DELETE'
  })
}

/**
 * Generate text using a preset
 */
export async function generateText(
  request: GenerateTextRequest
): Promise<GenerateTextResponse> {
  return apiClient.request<GenerateTextResponse>('/v1/text-generation/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request)
  })
}

