'use client'

import type { NodeOutputRef, SlotContentType } from '@/types/preview'
import { CONTENT_TYPE_ICONS } from '@/lib/preview-utils'
import { FileText } from 'lucide-react'

interface OutputBlockProps {
  output: NodeOutputRef
  contentType: SlotContentType
  value: unknown
  isAssigned: boolean
}

function formatPreview(value: unknown, contentType: SlotContentType): string {
  if (value === null || value === undefined) return '(empty)'

  // Quote-like objects
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>
    if (typeof obj.text === 'string') {
      return obj.text.length > 80 ? obj.text.slice(0, 77) + '...' : obj.text
    }
    // Image match objects
    if (typeof obj.url === 'string' || typeof obj.signedUrl === 'string') {
      return 'Image'
    }
  }

  if (contentType === 'text' && typeof value === 'string') {
    return value.length > 80 ? value.slice(0, 77) + '...' : value
  }
  if (contentType === 'image') {
    if (typeof value === 'string') return 'Image'
    if (Array.isArray(value)) return `${value.length} image(s)`
  }
  if (contentType === 'json') {
    return typeof value === 'string' ? value.slice(0, 60) : JSON.stringify(value).slice(0, 60)
  }
  if (Array.isArray(value)) return `[${value.length} items]`
  return String(value).slice(0, 80)
}

export function OutputBlock({ output, contentType, value, isAssigned }: OutputBlockProps) {
  const Icon = CONTENT_TYPE_ICONS[contentType] ?? FileText

  return (
    <div
      className={`px-3 py-2.5 rounded-lg border text-left transition-colors ${
        isAssigned
          ? 'bg-indigo-50 border-indigo-200'
          : 'bg-white border-slate-200 hover:border-slate-300'
      }`}
    >
      <div className="flex items-center gap-2 mb-1">
        <Icon size={14} className="text-slate-400 shrink-0" />
        <span className="text-xs font-medium text-slate-700 truncate">
          {output.label}
        </span>
        {isAssigned && (
          <span className="ml-auto text-[10px] font-medium text-indigo-600 bg-indigo-100 px-1.5 py-0.5 rounded">
            Assigned
          </span>
        )}
      </div>
      <p className="text-xs text-slate-500 truncate pl-[22px]">
        {formatPreview(value, contentType)}
      </p>
    </div>
  )
}
