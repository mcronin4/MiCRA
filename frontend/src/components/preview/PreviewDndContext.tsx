'use client'

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { useState } from 'react'
import { usePreviewStore } from '@/lib/stores/previewStore'
import type { NodeOutputRef, SlotContentType } from '@/types/preview'

export interface DragData {
  ref: NodeOutputRef
  contentType: SlotContentType
  value: unknown
}

export interface DropData {
  slotId: string
  acceptsTypes: SlotContentType[]
}

export function PreviewDndContext({
  children,
}: {
  children: React.ReactNode
}) {
  const assignSlot = usePreviewStore((s) => s.assignSlot)
  const [activeDrag, setActiveDrag] = useState<DragData | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  )

  function handleDragStart(event: DragStartEvent) {
    setActiveDrag(event.active.data.current as DragData)
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveDrag(null)

    if (!over) return

    const dragData = active.data.current as DragData
    const dropData = over.data.current as DropData

    if (!dropData.acceptsTypes.includes(dragData.contentType)) return

    assignSlot(dropData.slotId, [dragData.ref])
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      {children}
      <DragOverlay dropAnimation={null}>
        {activeDrag && <DragOverlayPreview data={activeDrag} />}
      </DragOverlay>
    </DndContext>
  )
}

function DragOverlayPreview({ data }: { data: DragData }) {
  return (
    <div className="px-3 py-2 rounded-lg border border-indigo-400 bg-indigo-50 shadow-lg max-w-56">
      <span className="text-xs font-medium text-indigo-900 truncate block">
        {data.ref.label}
      </span>
    </div>
  )
}
