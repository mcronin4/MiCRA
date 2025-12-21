import { apiClient } from './client'

export interface ImageMatchResult {
  image_index: number
  score: number
  semantic_score: number
  detail_scores: Record<string, number>
}

export interface ImageMatchResponse {
  success: boolean
  matches: ImageMatchResult[]
  error?: string
}

export async function matchImagesToText(
  images: string[],
  text: string,
  maxDimension = 1024
): Promise<ImageMatchResponse> {
  return apiClient.request<ImageMatchResponse>('/api/v1/image-matching/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ images, text, max_dimension: maxDimension })
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

