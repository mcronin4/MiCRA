// API client for transcription functionality
import { apiClient } from './client';

export interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
}

export interface TranscriptionResponse {
  success: boolean;
  segments?: TranscriptionSegment[];
  error?: string;
  message?: string;
  detail?: string; // FastAPI error detail field
}

export async function transcribeUrl(url: string): Promise<TranscriptionResponse> {
  return apiClient.request<TranscriptionResponse>('/v1/transcription/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url }),
  });
}

export async function transcribeFile(file: File): Promise<TranscriptionResponse> {
  const formData = new FormData();
  formData.append('file', file);
  
  // Don't set Content-Type header for FormData - browser will set it with boundary
  return apiClient.request<TranscriptionResponse>('/v1/transcription/upload/', {
    method: 'POST',
    body: formData,
    // Note: Don't set Content-Type header - browser will set it automatically with boundary
  });
}

