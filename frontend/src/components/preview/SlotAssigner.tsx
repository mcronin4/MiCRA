'use client'

import { useRef, useEffect } from 'react'
import { usePreviewStore } from '@/lib/stores/previewStore'
import type { TemplateSlot, SlotContentType } from '@/types/preview'
import { useNodeOutputs, type OutputEntry } from './OutputsSidebar'
import { X, FileText, Image, Music, Video, Braces } from 'lucide-react'

const CONTENT_TYPE_ICONS: Record<SlotContentType, React.ElementType> = {
  text: FileText,
  image: Image,
  audio: Music,
  video: Video,
  json: Braces,
}

interface SlotAssignerProps {
  slot: TemplateSlot
  onClose: () => void
  position: { top: number; left: number }
}

export function SlotAssigner({ slot, onClose, position }: SlotAssignerProps) {
  const assignSlot = usePreviewStore((s) => s.assignSlot)
  const clearSlot = usePreviewStore((s) => s.clearSlot)
  const config = usePreviewStore((s) => s.config)
  const groups = useNodeOutputs()
  const popoverRef = useRef<HTMLDivElement>(null)

  const currentAssignment = config?.assignments.find(
    (a) => a.slotId === slot.slotId
  )

  // Filter compatible outputs
  const compatibleOutputs: OutputEntry[] = []
  const incompatibleOutputs: OutputEntry[] = []

  for (const group of groups) {
    for (const entry of group.outputs) {
      if (slot.acceptsTypes.includes(entry.contentType)) {
        compatibleOutputs.push(entry)
      } else {
        incompatibleOutputs.push(entry)
      }
    }
  }

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  return (
    <div
      ref={popoverRef}
      className="fixed z-50 w-72 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden"
      style={{ top: position.top, left: position.left }}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 bg-slate-50">
        <span className="text-xs font-semibold text-slate-700">
          Assign to: {slot.label}
        </span>
        <button
          onClick={onClose}
          className="p-1 hover:bg-slate-200 rounded transition-colors"
        >
          <X size={14} className="text-slate-400" />
        </button>
      </div>

      <div className="max-h-64 overflow-y-auto p-2 space-y-1">
        {currentAssignment?.source && (
          <button
            onClick={() => {
              clearSlot(slot.slotId)
              onClose()
            }}
            className="w-full text-left px-3 py-2 rounded-lg text-xs text-red-600 hover:bg-red-50 transition-colors"
          >
            Clear assignment
          </button>
        )}

        {compatibleOutputs.length === 0 && (
          <p className="text-xs text-slate-400 text-center py-4">
            No compatible outputs available.
            <br />
            Accepts: {slot.acceptsTypes.join(', ')}
          </p>
        )}

        {compatibleOutputs.map((entry) => {
          const Icon = CONTENT_TYPE_ICONS[entry.contentType] ?? FileText
          const isSelected =
            currentAssignment?.source?.nodeId === entry.ref.nodeId &&
            currentAssignment?.source?.outputKey === entry.ref.outputKey

          return (
            <button
              key={`${entry.ref.nodeId}:${entry.ref.outputKey}`}
              onClick={() => {
                assignSlot(slot.slotId, entry.ref)
                onClose()
              }}
              className={`w-full text-left px-3 py-2 rounded-lg transition-colors flex items-center gap-2 ${
                isSelected
                  ? 'bg-indigo-50 ring-1 ring-indigo-200'
                  : 'hover:bg-slate-50'
              }`}
            >
              <Icon size={14} className="text-slate-400 shrink-0" />
              <span className="text-xs text-slate-700 truncate">
                {entry.ref.label}
              </span>
            </button>
          )
        })}

        {incompatibleOutputs.length > 0 && (
          <>
            <div className="text-[10px] text-slate-400 uppercase tracking-wide px-3 pt-2">
              Incompatible
            </div>
            {incompatibleOutputs.map((entry) => {
              const Icon = CONTENT_TYPE_ICONS[entry.contentType] ?? FileText
              return (
                <div
                  key={`${entry.ref.nodeId}:${entry.ref.outputKey}`}
                  className="w-full px-3 py-2 rounded-lg flex items-center gap-2 opacity-40"
                >
                  <Icon size={14} className="text-slate-400 shrink-0" />
                  <span className="text-xs text-slate-500 truncate">
                    {entry.ref.label}
                  </span>
                </div>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}
