import { apiClient } from './client'

export interface ImageWithId {
  id: string
  base64: string
}

export interface ImageMatchResult {
  image_id: string
  status: 'success' | 'failed'
  combined_score?: number
  semantic_score?: number
  detail_score?: number
  error?: string
}

export interface ImageMatchResponse {
  success: boolean
  results: ImageMatchResult[]
  error?: string
}

export async function matchImagesToText(
  images: ImageWithId[],
  text: string,
  maxDimension = 1024
): Promise<ImageMatchResponse> {
  return apiClient.request<ImageMatchResponse>('/v1/image-matching/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      images: images.map(img => ({ id: img.id, base64: img.base64 })),
      text, 
      max_dimension: maxDimension 
    })
  })
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
  })
}

