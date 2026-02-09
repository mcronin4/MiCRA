'use client'

interface TextPreviewProps {
  value: unknown
  maxLength?: number
}

function stripCodeFence(raw: string): string {
  const trimmed = raw.trim()
  const match = trimmed.match(/^```(?:json|text)?\s*([\s\S]*?)\s*```$/i)
  return match ? match[1] : raw
}

function tryParseJson(raw: string): unknown | null {
  const candidate = stripCodeFence(raw).trim()
  if (!candidate) return null
  if (!candidate.startsWith('{') && !candidate.startsWith('[')) return null
  try {
    return JSON.parse(candidate)
  } catch {
    return null
  }
}

function extractPrimaryTextFromObject(
  obj: Record<string, unknown>
): string | null {
  const preferredKeys = [
    'content',
    'text',
    'generated_text',
    'transcription',
    'caption',
    'body',
    'message',
  ] as const

  for (const key of preferredKeys) {
    const val = obj[key]
    if (typeof val === 'string' && val.trim()) return val
  }

  return null
}

function extractText(value: unknown): string {
  if (typeof value === 'string') {
    const parsed = tryParseJson(value)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const extracted = extractPrimaryTextFromObject(parsed as Record<string, unknown>)
      if (extracted) return extracted
    }
    return value
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>
    const extracted = extractPrimaryTextFromObject(obj)
    if (extracted) return extracted
    if (typeof obj.text === 'string') return obj.text
    if (typeof obj.transcription === 'string') return obj.transcription
    if (typeof obj.generated_text === 'string') return obj.generated_text
  }

  return String(value ?? '')
}

export function TextPreview({ value, maxLength = 60 }: TextPreviewProps) {
  const text = extractText(value)
  const truncated =
    text.length > maxLength ? text.slice(0, maxLength - 3) + '...' : text

  return <p className="text-xs text-slate-600 line-clamp-2">{truncated}</p>
}
