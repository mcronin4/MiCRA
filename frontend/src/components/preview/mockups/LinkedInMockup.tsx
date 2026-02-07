'use client'

import { useState, useCallback } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { usePreviewStore } from '@/lib/stores/previewStore'
import { LINKEDIN_TEMPLATE } from '@/types/preview'
import type {
  TemplateSlot,
  SlotAssignment,
  NodeOutputRef,
} from '@/types/preview'
import type { DragData } from '../PreviewDndContext'
import { SlotAssigner } from '../SlotAssigner'
import { TextSlot } from '../slots/TextSlot'
import { ImageSlot } from '../slots/ImageSlot'
import { MediaSlot } from '../slots/MediaSlot'
import { AlertTriangle, Linkedin } from 'lucide-react'
import { usePreviewData } from '../PreviewDataContext'

/** Resolve a single NodeOutputRef to its raw value */
function resolveRef(
  ref: NodeOutputRef,
  nodes: Record<string, { outputs: Record<string, unknown> | null }>
): unknown | undefined {
  const node = nodes[ref.nodeId]
  if (!node?.outputs) return undefined

  const val = node.outputs[ref.outputKey]
  if (val === undefined) return undefined

  // If an arrayIndex is specified, pick that item (with bounds check)
  if (ref.arrayIndex !== undefined && Array.isArray(val)) {
    if (ref.arrayIndex < 0 || ref.arrayIndex >= val.length) return undefined
    return val[ref.arrayIndex]
  }
  return val
}

function resolveSlotValue(
  assignment: SlotAssignment,
  nodes: Record<string, { outputs: Record<string, unknown> | null }>,
  slotAcceptsTypes: string[]
): { value: unknown; stale: boolean } {
  if (assignment.sources.length === 0) return { value: null, stale: false }

  const isMediaSlot =
    slotAcceptsTypes.includes('image') || slotAcceptsTypes.includes('video')

  const resolved: unknown[] = []
  let anyStale = false

  for (const ref of assignment.sources) {
    const val = resolveRef(ref, nodes)
    if (val === undefined) {
      anyStale = true
    } else {
      resolved.push(val)
    }
  }

  if (resolved.length === 0) return { value: null, stale: anyStale }

  // For media slots, use the first resolved value
  if (isMediaSlot) {
    return { value: resolved[0], stale: anyStale }
  }

  // Single source → pass through as-is (preserves object structure for TextSlot)
  if (resolved.length === 1) {
    return { value: resolved[0], stale: anyStale }
  }

  // Multiple text sources → return as array so TextSlot can render each item
  return { value: resolved, stale: anyStale }
}

function isVideoUrl(url: string): boolean {
  return /\.(mp4|webm|mov|avi)(\?|$)/i.test(url) || /\/videos?\//i.test(url)
}

function SlotSkeleton({ slot }: { slot: TemplateSlot }) {
  const isMedia =
    slot.acceptsTypes.includes('image') || slot.acceptsTypes.includes('video')
  const isHeadline = slot.slotId === 'headline'

  if (isMedia) {
    return (
      <div className="w-full rounded-lg overflow-hidden">
        <div className="skeleton-shimmer w-full h-52 rounded-lg" />
      </div>
    )
  }

  if (isHeadline) {
    return (
      <div className="space-y-2 py-1">
        <div className="skeleton-shimmer h-5 rounded-md w-[80%]" />
        <div className="skeleton-shimmer h-5 rounded-md w-[55%]" style={{ animationDelay: '150ms' }} />
      </div>
    )
  }

  return (
    <div className="space-y-1.5 py-1">
      <div className="skeleton-shimmer h-3.5 rounded w-full" />
      <div className="skeleton-shimmer h-3.5 rounded w-[92%]" style={{ animationDelay: '100ms' }} />
      <div className="skeleton-shimmer h-3.5 rounded w-[78%]" style={{ animationDelay: '200ms' }} />
      <div className="skeleton-shimmer h-3.5 rounded w-[60%]" style={{ animationDelay: '300ms' }} />
    </div>
  )
}

export function LinkedInMockup() {
  const { nodes, outputsLoading } = usePreviewData()
  const config = usePreviewStore((s) => s.config)
  const [activeSlotId, setActiveSlotId] = useState<string | null>(null)
  const [popoverPos, setPopoverPos] = useState({ top: 0, left: 0 })

  const handleSlotClick = useCallback(
    (slotId: string, e: React.MouseEvent) => {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      const estimatedPopupHeight = 320
      const spaceBelow = window.innerHeight - rect.bottom - 4

      const top =
        spaceBelow >= estimatedPopupHeight
          ? rect.bottom + 4
          : Math.max(8, rect.top - estimatedPopupHeight - 4)

      setPopoverPos({
        top,
        left: Math.min(rect.left, window.innerWidth - 300),
      })
      setActiveSlotId((prev) => (prev === slotId ? null : slotId))
    },
    []
  )

  const activeSlot = activeSlotId
    ? LINKEDIN_TEMPLATE.slots.find((s) => s.slotId === activeSlotId) ?? null
    : null

  return (
    <div className="w-full max-w-xl mx-auto">
      {/* LinkedIn card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Header bar */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
          <div className="w-8 h-8 rounded-full bg-[#0a66c2] flex items-center justify-center">
            <Linkedin size={16} className="text-white" />
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-800">
              LinkedIn Post Preview
            </div>
            <div className="text-[11px] text-slate-400">Draft</div>
          </div>
        </div>

        {/* Slots */}
        <div className="p-4 space-y-3">
          {LINKEDIN_TEMPLATE.slots.map((slot) => {
            const assignment = config?.assignments.find(
              (a) => a.slotId === slot.slotId
            )
            const { value, stale } = resolveSlotValue(
              assignment ?? { slotId: slot.slotId, sources: [] },
              nodes,
              slot.acceptsTypes
            )

            // Show skeleton when loading and slot has no resolved value
            // (stale slots during loading just mean sources haven't loaded yet)
            if (outputsLoading && value === null) {
              return <SlotSkeleton key={slot.slotId} slot={slot} />
            }

            return (
              <DroppableSlotContainer
                key={slot.slotId}
                slot={slot}
                value={value}
                stale={stale}
                isActive={activeSlotId === slot.slotId}
                onClick={(e) => handleSlotClick(slot.slotId, e)}
              />
            )
          })}
        </div>
      </div>

      {/* Slot assigner popover */}
      {activeSlot && (
        <SlotAssigner
          key={activeSlot.slotId}
          slot={activeSlot}
          onClose={() => setActiveSlotId(null)}
          position={popoverPos}
        />
      )}
    </div>
  )
}

function DroppableSlotContainer({
  slot,
  value,
  stale,
  isActive,
  onClick,
}: {
  slot: TemplateSlot
  value: unknown
  stale: boolean
  isActive: boolean
  onClick: (e: React.MouseEvent) => void
}) {
  const { isOver, setNodeRef, active } = useDroppable({
    id: `slot-${slot.slotId}`,
    data: { slotId: slot.slotId, acceptsTypes: slot.acceptsTypes },
  })

  // Check if the currently dragged item is compatible with this slot
  const dragData = active?.data.current as DragData | undefined
  const isDragging = !!active
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

  if (!hasValue) {
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

  // Render filled slot
  return (
    <button
      ref={setNodeRef}
      onClick={onClick}
      className={`w-full text-left rounded-lg border p-3 transition-all ${
        showDropHighlight
          ? 'border-indigo-300 ring-2 ring-indigo-200 scale-[1.01]'
          : showInvalidHighlight
            ? 'border-red-300 ring-1 ring-red-200'
            : isActive
              ? 'border-indigo-300 ring-2 ring-indigo-200'
              : 'border-transparent hover:border-slate-200'
      }`}
    >
      {slot.acceptsTypes.includes('image') ||
      slot.acceptsTypes.includes('video') ? (
        slot.acceptsTypes.includes('video') &&
        typeof value === 'string' &&
        isVideoUrl(value) ? (
          <MediaSlot value={value} mediaType="video" />
        ) : (
          <ImageSlot value={value} />
        )
      ) : (
        <TextSlot
          value={value}
          variant={
            slot.slotId === 'headline'
              ? 'headline'
              : slot.slotId === 'caption'
                ? 'caption'
                : 'body'
          }
        />
      )}
    </button>
  )
}
