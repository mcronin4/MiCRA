import { apiClient } from './client'

export interface GenerateImageRequest {
    prompt: string
    input_image?: string  // Base64 encoded image (optional, for image-to-image)
    aspect_ratio: string  // "1:1", "16:9", "9:16", "4:3", "3:4"
}

export interface GenerateImageResponse {
    success: boolean
    image_base64?: string  // Full data URL with base64 image
    error?: string
}

export async function generateImage(
    request: GenerateImageRequest
): Promise<GenerateImageResponse> {
    return apiClient.request<GenerateImageResponse>('/v1/image-generation/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request)
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
