'use client'

import NextImage from 'next/image'

interface ImageSlotProps {
  value: unknown
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
