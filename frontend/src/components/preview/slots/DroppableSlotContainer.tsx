'use client'

import { useDroppable } from '@dnd-kit/core'
import { AlertTriangle } from 'lucide-react'
import type { TemplateSlot } from '@/types/preview'
import type { DragData } from '../PreviewDndContext'
import { isVideoUrl } from '@/lib/preview-utils'
import { TextSlot } from './TextSlot'
import { EditableTextSlot } from './EditableTextSlot'
import { ImageSlot } from './ImageSlot'
import { MediaSlot } from './MediaSlot'

export interface DroppableSlotContainerProps {
  slot: TemplateSlot
  value: unknown
  stale: boolean
  isActive: boolean
  onClick: (e: React.MouseEvent) => void
  isDraftMode?: boolean
  isTextSlot?: boolean
  onDraftSlotChange?: (slotId: string, value: unknown) => void
}

export function DroppableSlotContainer({
  slot,
  value,
  stale,
  isActive,
  onClick,
  isDraftMode = false,
  isTextSlot = false,
  onDraftSlotChange,
}: DroppableSlotContainerProps) {
  const { isOver, setNodeRef, active } = useDroppable({
    id: `slot-${slot.slotId}`,
    data: { slotId: slot.slotId, acceptsTypes: slot.acceptsTypes },
  })

  const dragData = active?.data.current as DragData | undefined
  const isDragging = !!active && !isDraftMode
  const isCompatible = dragData
    ? slot.acceptsTypes.includes(dragData.contentType)
    : false
  const showDropHighlight = isOver && isCompatible
  const showInvalidHighlight = isOver && !isCompatible

  const hasValue = value !== null && value !== undefined

  if (stale) {
    return (
      <button
        ref={setNodeRef}
        onClick={onClick}
        className={`w-full text-left rounded-lg border-2 border-dashed border-amber-300 bg-amber-50 p-3 transition-all hover:border-amber-400 ${
          isActive ? 'ring-2 ring-amber-300' : ''
        } ${showDropHighlight ? 'border-indigo-400 bg-indigo-50 ring-2 ring-indigo-200 scale-[1.01]' : ''}`}
      >
        <div className="flex items-center gap-2 text-xs text-amber-600">
          <AlertTriangle size={14} />
          <span className="font-medium">{slot.label}</span>
          <span>
            {showDropHighlight ? '— drop to replace' : '— stale, re-run workflow'}
          </span>
        </div>
      </button>
    )
  }

  const showAsEditableEmpty =
    isDraftMode && isTextSlot && onDraftSlotChange !== undefined

  if (!hasValue) {
    if (showAsEditableEmpty) {
      return (
        <div
          ref={setNodeRef}
          className="w-full text-left rounded-lg border-2 border-dashed border-slate-200 bg-slate-50/50 p-3"
        >
          <EditableTextSlot
            value=""
            onChange={(v) => onDraftSlotChange!(slot.slotId, v)}
            maxChars={slot.maxChars}
          />
        </div>
      )
    }
    return (
      <button
        ref={setNodeRef}
        onClick={onClick}
        className={`w-full text-left rounded-lg border-2 border-dashed p-3 transition-all ${
          showDropHighlight
            ? 'border-indigo-400 bg-indigo-50 ring-2 ring-indigo-200 scale-[1.01]'
            : showInvalidHighlight
              ? 'border-red-300 bg-red-50/50'
              : isActive
                ? 'border-indigo-400 bg-indigo-50 ring-2 ring-indigo-200'
                : isDragging && isCompatible
                  ? 'border-indigo-300 bg-indigo-50/30'
                  : 'border-slate-200 bg-slate-50/50 hover:border-slate-300 hover:bg-slate-50'
        }`}
      >
        <span className="text-xs text-slate-400">
          {slot.label}
          {slot.required && <span className="text-red-400 ml-0.5">*</span>}
          {' — '}
          {showDropHighlight
            ? 'Drop here!'
            : showInvalidHighlight
              ? 'Incompatible type'
              : 'drag or click to assign'}
        </span>
      </button>
    )
  }

  const showAsEditable =
    isDraftMode && isTextSlot && onDraftSlotChange !== undefined
  return (
    <button
      ref={setNodeRef}
      onClick={showAsEditable ? undefined : onClick}
      type="button"
      className={`w-full text-left rounded-lg border p-3 transition-all ${
        showDropHighlight
          ? 'border-indigo-300 ring-2 ring-indigo-200 scale-[1.01]'
          : showInvalidHighlight
            ? 'border-red-300 ring-1 ring-red-200'
            : isActive && !showAsEditable
              ? 'border-indigo-300 ring-2 ring-indigo-200'
              : 'border-transparent hover:border-slate-200'
      }`}
    >
      {slot.acceptsTypes.includes('image') || slot.acceptsTypes.includes('video') ? (
        slot.acceptsTypes.includes('video') &&
        typeof value === 'string' &&
        isVideoUrl(value) ? (
          <MediaSlot value={value} mediaType="video" />
        ) : (
          <ImageSlot value={value} />
        )
      ) : showAsEditable ? (
        <div onClick={(e) => e.stopPropagation()}>
          <EditableTextSlot
            value={value}
            onChange={(v) => onDraftSlotChange(slot.slotId, v)}
            maxChars={slot.maxChars}
          />
        </div>
      ) : (
        <TextSlot value={value} />
      )}
    </button>
  )
}
