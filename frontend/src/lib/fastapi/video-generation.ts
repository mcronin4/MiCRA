import { apiClient } from './client'

export interface GenerateVideoRequest {
    prompt: string
    images?: string[]           // Base64 encoded images (optional)
    text_context?: string       // Additional text context
    duration_seconds?: string   // "4", "6", "8"
    aspect_ratio?: string       // "16:9", "9:16"
    resolution?: string         // "720p", "1080p", "4k"
    negative_prompt?: string
    video_style?: string        // "marketing", "slideshow", "product_demo", "tiktok", "cinematic", "documentary"
}

export interface GenerateVideoResponse {
    success: boolean
    video_url?: string          // Data URL or artifact path
    prompt_bundle?: Record<string, unknown>
    error?: string
}

export async function generateVideo(
    request: GenerateVideoRequest
): Promise<GenerateVideoResponse> {
    return apiClient.request<GenerateVideoResponse>('/v1/video-generation/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request)
    })
}
