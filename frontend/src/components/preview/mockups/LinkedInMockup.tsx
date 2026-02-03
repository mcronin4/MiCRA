'use client'

import { useState, useCallback } from 'react'
import { useWorkflowStore } from '@/lib/stores/workflowStore'
import { usePreviewStore } from '@/lib/stores/previewStore'
import { LINKEDIN_TEMPLATE } from '@/types/preview'
import type { TemplateSlot, SlotAssignment } from '@/types/preview'
import { SlotAssigner } from '../SlotAssigner'
import { TextSlot } from '../slots/TextSlot'
import { ImageSlot } from '../slots/ImageSlot'
import { MediaSlot } from '../slots/MediaSlot'
import { AlertTriangle, Linkedin } from 'lucide-react'

function resolveSlotValue(
  assignment: SlotAssignment,
  nodes: Record<string, { outputs: Record<string, unknown> | null }>
): { value: unknown; stale: boolean } {
  if (!assignment.source) return { value: null, stale: false }

  const node = nodes[assignment.source.nodeId]
  if (!node || !node.outputs) {
    return { value: null, stale: true }
  }

  const val = node.outputs[assignment.source.outputKey]
  if (val === undefined) return { value: null, stale: true }

  return { value: val, stale: false }
}

export function LinkedInMockup() {
  const nodes = useWorkflowStore((s) => s.nodes)
  const config = usePreviewStore((s) => s.config)
  const [activeSlotId, setActiveSlotId] = useState<string | null>(null)
  const [popoverPos, setPopoverPos] = useState({ top: 0, left: 0 })

  const handleSlotClick = useCallback(
    (slotId: string, e: React.MouseEvent) => {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      setPopoverPos({
        top: rect.bottom + 4,
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
              assignment ?? { slotId: slot.slotId, source: null },
              nodes
            )

            return (
              <div key={slot.slotId}>
                <SlotContainer
                  slot={slot}
                  value={value}
                  stale={stale}
                  isActive={activeSlotId === slot.slotId}
                  onClick={(e) => handleSlotClick(slot.slotId, e)}
                />
              </div>
            )
          })}
        </div>
      </div>

      {/* Slot assigner popover */}
      {activeSlot && (
        <SlotAssigner
          slot={activeSlot}
          onClose={() => setActiveSlotId(null)}
          position={popoverPos}
        />
      )}
    </div>
  )
}

function SlotContainer({
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
  const hasValue = value !== null && value !== undefined

  if (stale) {
    return (
      <button
        onClick={onClick}
        className={`w-full text-left rounded-lg border-2 border-dashed border-amber-300 bg-amber-50 p-3 transition-colors hover:border-amber-400 ${
          isActive ? 'ring-2 ring-amber-300' : ''
        }`}
      >
        <div className="flex items-center gap-2 text-xs text-amber-600">
          <AlertTriangle size={14} />
          <span className="font-medium">{slot.label}</span>
          <span>— stale, re-run workflow</span>
        </div>
      </button>
    )
  }

  if (!hasValue) {
    return (
      <button
        onClick={onClick}
        className={`w-full text-left rounded-lg border-2 border-dashed p-3 transition-colors ${
          isActive
            ? 'border-indigo-400 bg-indigo-50 ring-2 ring-indigo-200'
            : 'border-slate-200 bg-slate-50/50 hover:border-slate-300 hover:bg-slate-50'
        }`}
      >
        <span className="text-xs text-slate-400">
          {slot.label}
          {slot.required && <span className="text-red-400 ml-0.5">*</span>}
          {' — click to assign'}
        </span>
      </button>
    )
  }

  // Render filled slot
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-lg border p-3 transition-colors ${
        isActive
          ? 'border-indigo-300 ring-2 ring-indigo-200'
          : 'border-transparent hover:border-slate-200'
      }`}
    >
      {slot.acceptsTypes.includes('image') ||
      slot.acceptsTypes.includes('video') ? (
        slot.acceptsTypes.includes('video') &&
        typeof value === 'string' &&
        (value.includes('.mp4') || value.includes('video')) ? (
          <MediaSlot value={value} mediaType="video" />
        ) : (
          <ImageSlot value={value} />
        )
      ) : (
        <TextSlot
          value={typeof value === 'string' ? value : Array.isArray(value) ? value.join('\n\n') : JSON.stringify(value, null, 2)}
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
