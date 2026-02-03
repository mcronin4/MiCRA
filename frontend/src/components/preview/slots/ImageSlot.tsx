'use client'

import NextImage from 'next/image'

interface ImageSlotProps {
  value: unknown
}

function extractUrl(value: unknown): string | null {
  if (typeof value === 'string' && value.startsWith('http')) return value
  if (Array.isArray(value) && value.length > 0) {
    const first = value[0]
    if (typeof first === 'string' && first.startsWith('http')) return first
    if (first && typeof first === 'object' && 'url' in first) {
      return String((first as Record<string, unknown>).url)
    }
    if (first && typeof first === 'object' && 'signedUrl' in first) {
      return String((first as Record<string, unknown>).signedUrl)
    }
  }
  if (value && typeof value === 'object' && 'url' in value) {
    return String((value as Record<string, unknown>).url)
  }
  if (value && typeof value === 'object' && 'signedUrl' in value) {
    return String((value as Record<string, unknown>).signedUrl)
  }
  return null
}

export function ImageSlot({ value }: ImageSlotProps) {
  const url = extractUrl(value)

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
    </div>
  )
}
