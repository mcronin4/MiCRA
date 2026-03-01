'use client'

import { useState, useCallback } from 'react'
import { usePreviewStore } from '@/lib/stores/previewStore'
import type { PlatformTemplate, TemplateSlot } from '@/types/preview'
import { resolveSlotValue } from '@/lib/preview-utils'
import { SlotAssigner } from '../SlotAssigner'
import { SlotSkeleton } from '../slots/SlotSkeleton'
import { DroppableSlotContainer } from '../slots/DroppableSlotContainer'
import { usePreviewData } from '../PreviewDataContext'

export interface PlatformMockupBaseProps {
  template: PlatformTemplate
  /** Platform branding (icon + title) */
  headerContent: React.ReactNode
  /** Optional actions in the card header (draft selector, save, etc.) */
  headerActions?: React.ReactNode
  /** Optional footer content (autosave status, etc.) */
  footerContent?: React.ReactNode
}

export function PlatformMockupBase({
  template,
  headerContent,
  headerActions,
  footerContent,
}: PlatformMockupBaseProps) {
  const {
    nodes,
    outputsLoading,
    slotContent,
    isDraftMode,
    onDraftSlotChange,
  } = usePreviewData()
  const config = usePreviewStore((s) => s.config)
  const [activeSlotId, setActiveSlotId] = useState<string | null>(null)
  const [popoverPos, setPopoverPos] = useState({ top: 0, left: 0 })

  const handleSlotClick = useCallback((slotId: string, e: React.MouseEvent) => {
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
  }, [])

  const activeSlot: TemplateSlot | null = activeSlotId
    ? template.slots.find((s) => s.slotId === activeSlotId) ?? null
    : null

  return (
    <div className="w-full max-w-xl mx-auto">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-visible">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-100">
          <div className="flex items-center gap-2 min-w-0">{headerContent}</div>
          {headerActions && (
            <div className="flex items-center gap-2 shrink-0">
              {headerActions}
            </div>
          )}
        </div>

        <div className="p-4 space-y-3">
          {template.slots.map((slot) => {
            let value: unknown = null
            let stale = false

            if (isDraftMode && slotContent) {
              value = slotContent[slot.slotId] ?? null
            } else {
              const assignment = config?.assignments.find(
                (a) => a.slotId === slot.slotId
              )
              const resolved = resolveSlotValue(
                assignment ?? { slotId: slot.slotId, sources: [] },
                nodes,
                slot.acceptsTypes
              )
              value = resolved.value
              stale = resolved.stale
            }

            if (outputsLoading && value === null && !isDraftMode) {
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
                isDraftMode={isDraftMode}
                isTextSlot={
                  slot.acceptsTypes.includes('text')
                }
                onDraftSlotChange={
                  isDraftMode && onDraftSlotChange ? onDraftSlotChange : undefined
                }
              />
            )
          })}
        </div>

        {footerContent && (
          <div className="px-4 py-2 border-t border-slate-100 min-h-[36px] flex items-center">
            {footerContent}
          </div>
        )}
      </div>

      {activeSlot && !isDraftMode && (
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
