'use client'

import { Play } from 'lucide-react'

interface MediaSlotProps {
  value: unknown
  mediaType: 'audio' | 'video'
}

function extractUrl(value: unknown): string | null {
  if (typeof value === 'string' && value.startsWith('http')) return value
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>
    if (typeof obj.url === 'string') return obj.url
    if (typeof obj.signedUrl === 'string') return obj.signedUrl
  }
  if (Array.isArray(value) && value.length > 0) {
    return extractUrl(value[0])
  }
  return null
}

export function MediaSlot({ value, mediaType }: MediaSlotProps) {
  const url = extractUrl(value)

  if (!url) {
    return (
      <div className="w-full aspect-video bg-slate-100 rounded-lg flex items-center justify-center">
        <span className="text-xs text-slate-400">
          Unable to display {mediaType}
        </span>
      </div>
    )
  }

  if (mediaType === 'video') {
    return (
      <div className="w-full aspect-video rounded-lg overflow-hidden bg-black">
        <video src={url} controls className="w-full h-full object-contain" />
      </div>
    )
  }

  return (
    <div className="w-full bg-slate-50 rounded-lg p-3 flex items-center gap-3 border border-slate-200">
      <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
        <Play size={16} className="text-indigo-600" />
      </div>
      <audio src={url} controls className="flex-1 h-8" />
    </div>
  )
}
