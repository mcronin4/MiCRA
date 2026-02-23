'use client'

import { useDraggable } from '@dnd-kit/core'
import type { NodeOutputRef, SlotContentType } from '@/types/preview'
import { CONTENT_TYPE_ICONS, refKey } from '@/lib/preview-utils'
import { ImagePreview } from './previews/ImagePreview'
import { VideoPreview } from './previews/VideoPreview'
import { TextPreview } from './previews/TextPreview'
import { GripVertical, FileText } from 'lucide-react'

interface OutputBlockProps {
  output: NodeOutputRef
  contentType: SlotContentType
  value: unknown
  isAssigned: boolean
}

function MatchedImagePreview({ value }: { value: Record<string, unknown> }) {
  const score = value._matchScore as number | undefined
  const caption = value._caption as string | undefined
  const isFailed = value.status === 'failed' || !!value.error

  return (
    <div className="flex items-center gap-2">
      <div className="relative shrink-0">
        <ImagePreview value={value} size="thumbnail" />
        {typeof score === 'number' && score > 0 && (
          <div className="absolute -top-1 -right-1 bg-indigo-600 text-white text-[9px] font-bold px-1 py-0.5 rounded-full min-w-[28px] text-center">
            {Math.round(score * 100)}%
          </div>
        )}
        {isFailed && (
          <div className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold px-1 py-0.5 rounded-full">
            !
          </div>
        )}
      </div>
      {caption && (
        <p className="text-[10px] text-slate-500 truncate flex-1 min-w-0">
          {caption}
        </p>
      )}
    </div>
  )
}

function RichPreview({
  contentType,
  value,
  nodeType,
}: {
  contentType: SlotContentType
  value: unknown
  nodeType: string
}) {
  switch (contentType) {
    case 'image':
      if (
        value &&
        typeof value === 'object' &&
        (nodeType === 'ImageMatching' || '_matchScore' in (value as Record<string, unknown>))
      ) {
        return <MatchedImagePreview value={value as Record<string, unknown>} />
      }
      return <ImagePreview value={value} size="thumbnail" />
    case 'video':
      return <VideoPreview value={value} size="thumbnail" />
    case 'text':
      return <TextPreview value={value} maxLength={80} />
    default:
      return <TextPreview value={value} maxLength={60} />
  }
}

export function OutputBlock({
  output,
  contentType,
  value,
  isAssigned,
}: OutputBlockProps) {
  const dragId = refKey(output)
  const { attributes, listeners, setNodeRef, isDragging } =
    useDraggable({
      id: dragId,
      data: { ref: output, contentType, value },
    })

  const style = {
    opacity: isDragging ? 0.55 : 1,
  }

  const Icon = CONTENT_TYPE_ICONS[contentType] ?? FileText

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`px-3 py-2.5 rounded-lg border text-left transition-all cursor-grab active:cursor-grabbing ${
        isAssigned
          ? 'bg-indigo-50 border-indigo-200'
          : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm'
      } ${isDragging ? 'ring-2 ring-indigo-300 shadow-lg' : ''}`}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-1.5 min-w-0">
        <GripVertical size={12} className="text-slate-300 shrink-0" />
        <Icon size={14} className="text-slate-400 shrink-0" />
        <span className="text-xs font-medium text-slate-700 truncate flex-1 min-w-0">
          {output.label}
        </span>
        {isAssigned && (
          <span className="text-[10px] font-medium text-indigo-600 bg-indigo-100 px-1.5 py-0.5 rounded shrink-0">
            Assigned
          </span>
        )}
      </div>

      {/* Rich Preview */}
      <div className="pl-[26px]">
        <RichPreview
          contentType={contentType}
          value={value}
          nodeType={output.nodeType}
        />
      </div>
    </div>
  )
}
