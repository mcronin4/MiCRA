'use client'

import NextImage from 'next/image'

interface ImagePreviewProps {
  value: unknown
  size?: 'thumbnail' | 'full'
}

function extractImageUrl(value: unknown): string | null {
  if (typeof value === 'string') {
    if (value.startsWith('http') || value.startsWith('data:image')) {
      return value
    }
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>
    if (typeof obj.image_url === 'string') return obj.image_url
    if (typeof obj.url === 'string') return obj.url
    if (typeof obj.signedUrl === 'string') return obj.signedUrl
  }

  if (Array.isArray(value) && value.length > 0) {
    return extractImageUrl(value[0])
  }

  return null
}

export function ImagePreview({ value, size = 'thumbnail' }: ImagePreviewProps) {
  const url = extractImageUrl(value)

  if (!url) {
    return (
      <div
        className={`${size === 'thumbnail' ? 'w-12 h-12' : 'w-full aspect-video'} bg-slate-200 rounded flex items-center justify-center`}
      >
        <span className="text-[10px] text-slate-400">No img</span>
      </div>
    )
  }

  return (
    <div
      className={`${size === 'thumbnail' ? 'w-12 h-12' : 'w-full aspect-video'} relative rounded overflow-hidden bg-slate-100`}
    >
      <NextImage
        src={url}
        alt="Preview"
        fill
        className="object-cover"
        unoptimized
      />
    </div>
  )
}
