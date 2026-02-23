import { supabase } from "@/lib/supabase/client";
import { apiClient } from "./client";

export interface VoiceTranscriptionResponse {
  text: string;
  input_format: string;
  segments: number;
}

function getBackendBaseUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
  if (envUrl) {
    const clean = envUrl.endsWith("/") ? envUrl.slice(0, -1) : envUrl;
    return `${clean}/api`;
  }
  return "/backend";
}

async function getAuthHeader(): Promise<Record<string, string>> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.access_token) {
      return { Authorization: `Bearer ${session.access_token}` };
    }
  } catch {
    // best effort only
  }
  return {};
}

export async function transcribeMicrAIVoice(
  audioBlob: Blob
): Promise<VoiceTranscriptionResponse> {
  const file = new File([audioBlob], "micrai.wav", { type: "audio/wav" });
  const formData = new FormData();
  formData.append("file", file);
  return apiClient.request<VoiceTranscriptionResponse>("/v1/voice/transcribe", {
    method: "POST",
    body: formData,
  });
}

export async function synthesizeMicrAIVoice(text: string): Promise<Blob> {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(await getAuthHeader()),
  };
  const response = await fetch(`${getBackendBaseUrl()}/v1/voice/tts`, {
    method: "POST",
    headers,
    body: JSON.stringify({ text }),
  });
  if (!response.ok) {
    let detail = `Voice synthesis failed (${response.status})`;
    try {
      const payload = await response.json();
      detail = String(payload?.detail || detail);
    } catch {
      // ignore and use fallback detail
    }
    throw new Error(detail);
  }
  return response.blob();
}

