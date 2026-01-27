import { apiClient } from './client'

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

export async function extractKeyframesFromUrl(
  url: string,
  keepVideo = false
): Promise<ImageExtractionResponse> {
  return apiClient.request<ImageExtractionResponse>('/v1/image-extraction', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url, keep_video: keepVideo }),
  })
}

export async function extractKeyframesFromFile(
  file: File
): Promise<ImageExtractionResponse> {
  const formData = new FormData()
  formData.append('file', file)

  return apiClient.request<ImageExtractionResponse>('/v1/image-extraction/upload', {
    method: 'POST',
    body: formData,
  })
}
