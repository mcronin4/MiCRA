import { apiClient } from './client'

export type FrameSelectionMode = 'auto' | 'manual'

export interface ExtractedImage {
  id: string
  filename: string
  base64: string
  timestamp?: number
}

export interface ImageExtractionResponse {
  success: boolean
  output_dir?: string
  selected_frames?: Record<string, unknown>[]
  selected_images?: ExtractedImage[]
  selected_json_path?: string
  stats?: Record<string, number>
  error?: string
}

export async function extractKeyframesFromFile(
  file: File,
  selectionMode: FrameSelectionMode = 'auto',
  maxFrames?: number,
): Promise<ImageExtractionResponse> {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('selection_mode', selectionMode)
  if (typeof maxFrames === 'number') {
    formData.append('max_frames', String(maxFrames))
  }

  return apiClient.request<ImageExtractionResponse>('/v1/image-extraction/upload', {
    method: 'POST',
    body: formData,
  })
}
