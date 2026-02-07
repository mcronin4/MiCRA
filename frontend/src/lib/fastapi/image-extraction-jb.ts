import { apiClient } from './client'

export interface ExtractedImageJB {
  id: string
  filename: string
  base64: string
  timestamp?: number
  quality_score?: number
}

export interface ImageExtractionJBResponse {
  success: boolean
  output_dir?: string
  selected_frames?: Record<string, unknown>[]
  selected_images?: ExtractedImageJB[]
  selected_json_path?: string
  stats?: {
    total_frames_sampled: number
    after_deduplication: number
    final_selected: number
  }
  error?: string
}

export interface ImageExtractionJBOptions {
  frame_interval?: number
  max_final_frames?: number
  temporal_buckets?: number
}

export async function extractKeyframesJBFromUrl(
  url: string,
  options?: ImageExtractionJBOptions,
  keepVideo = false
): Promise<ImageExtractionJBResponse> {
  return apiClient.request<ImageExtractionJBResponse>('/v1/image-extraction-jb', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url,
      keep_video: keepVideo,
      ...options,
    }),
  })
}

export async function extractKeyframesJBFromFile(
  file: File,
  options?: ImageExtractionJBOptions
): Promise<ImageExtractionJBResponse> {
  const formData = new FormData()
  formData.append('file', file)

  if (options?.frame_interval) {
    formData.append('frame_interval', String(options.frame_interval))
  }
  if (options?.max_final_frames) {
    formData.append('max_final_frames', String(options.max_final_frames))
  }
  if (options?.temporal_buckets) {
    formData.append('temporal_buckets', String(options.temporal_buckets))
  }

  return apiClient.request<ImageExtractionJBResponse>('/v1/image-extraction-jb/upload', {
    method: 'POST',
    body: formData,
  })
}
