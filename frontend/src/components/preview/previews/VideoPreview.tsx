'use client'

import { Play } from 'lucide-react'

interface VideoPreviewProps {
  value: unknown
  size?: 'thumbnail' | 'full'
}

function extractVideoUrl(value: unknown): string | null {
  if (typeof value === 'string' && value.startsWith('http')) return value

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>
    if (typeof obj.url === 'string') return obj.url
    if (typeof obj.signedUrl === 'string') return obj.signedUrl
  }

  if (Array.isArray(value) && value.length > 0) {
    return extractVideoUrl(value[0])
  }

  return null
}

export function VideoPreview({ value, size = 'thumbnail' }: VideoPreviewProps) {
  const url = extractVideoUrl(value)

  if (!url) {
    return (
      <div
        className={`${size === 'thumbnail' ? 'w-12 h-12' : 'w-full aspect-video'} bg-slate-800 rounded flex items-center justify-center`}
      >
        <Play size={14} className="text-slate-400" />
      </div>
    )
  }

  if (size === 'thumbnail') {
    return (
      <div className="w-12 h-12 bg-black rounded flex items-center justify-center relative overflow-hidden">
        <Play size={14} className="text-white absolute z-10" />
        <video
          src={url}
          className="w-full h-full object-cover opacity-60"
          muted
          preload="metadata"
        />
      </div>
    )
  }

  return (
    <div className="w-full aspect-video rounded overflow-hidden bg-black">
      <video src={url} controls className="w-full h-full object-contain" />
    </div>
  )
}
