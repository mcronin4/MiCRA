'use client'

interface TextPreviewProps {
  value: unknown
  maxLength?: number
}

function extractText(value: unknown): string {
  if (typeof value === 'string') return value

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>
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
