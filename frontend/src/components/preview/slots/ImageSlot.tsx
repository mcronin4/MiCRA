'use client'

import NextImage from 'next/image'

interface ImageSlotProps {
  value: unknown
}

function extractScore(value: unknown): number | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>
    const raw = obj._matchScore ?? obj.similarity_score ?? obj.combined_score
    return typeof raw === 'number' ? raw : null
  }
  if (Array.isArray(value) && value.length > 0) {
    return extractScore(value[0])
  }
  return null
}

function extractUrl(value: unknown): string | null {
  if (typeof value === 'string') {
    if (value.startsWith('http') || value.startsWith('data:image')) return value
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>
    if (typeof obj.image_url === 'string') return obj.image_url
    if (typeof obj.url === 'string') return obj.url
    if (typeof obj.signedUrl === 'string') return obj.signedUrl
  }
  if (Array.isArray(value) && value.length > 0) {
    return extractUrl(value[0])
  }
  return null
}

export function ImageSlot({ value }: ImageSlotProps) {
  const url = extractUrl(value)
  const score = extractScore(value)

  if (!url) {
    return (
      <div className="w-full aspect-video bg-slate-100 rounded-lg flex items-center justify-center">
        <span className="text-xs text-slate-400">Unable to display image</span>
      </div>
    )
  }

  return (
    <div className="w-full aspect-video relative rounded-lg overflow-hidden bg-slate-100">
      <NextImage
        src={url}
        alt="Preview media"
        fill
        className="object-cover"
        unoptimized
      />
      {typeof score === 'number' && score > 0 && (
        <div className="absolute top-2 right-2 bg-indigo-600 text-white text-xs font-semibold px-2 py-1 rounded">
          {Math.round(score * 100)}%
        </div>
      )}
    </div>
  )
}
