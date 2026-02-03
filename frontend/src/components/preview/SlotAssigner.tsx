'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import { usePreviewStore } from '@/lib/stores/previewStore'
import { CONTENT_TYPE_ICONS, refKey, refsEqual } from '@/lib/preview-utils'
import type { TemplateSlot, NodeOutputRef } from '@/types/preview'
import { useNodeOutputs, type OutputEntry } from './OutputsSidebar'
import { X, FileText, Check } from 'lucide-react'

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

  // Local selection state (initialized from current assignment)
  const [selected, setSelected] = useState<NodeOutputRef[]>(
    () => currentAssignment?.sources ?? []
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

  const isMulti = compatibleOutputs.length > 1

  const toggleItem = useCallback((ref: NodeOutputRef) => {
    setSelected((prev) => {
      const idx = prev.findIndex((r) => refsEqual(r, ref))
      if (idx >= 0) {
        return prev.filter((_, i) => i !== idx)
      }
      return [...prev, ref]
    })
  }, [])

  const handleDone = useCallback(() => {
    if (selected.length === 0) {
      clearSlot(slot.slotId)
    } else {
      assignSlot(slot.slotId, selected)
    }
    onClose()
  }, [selected, slot.slotId, assignSlot, clearSlot, onClose])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        // In multi-select mode, save selections before closing
        if (isMulti) {
          handleDone()
        } else {
          onClose()
        }
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose, isMulti, handleDone])

  const isSelected = (ref: NodeOutputRef) =>
    selected.some((r) => refsEqual(r, ref))

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
          onClick={isMulti ? handleDone : onClose}
          className="p-1 hover:bg-slate-200 rounded transition-colors"
        >
          <X size={14} className="text-slate-400" />
        </button>
      </div>

      <div className="max-h-64 overflow-y-auto p-2 space-y-1">
        {currentAssignment && currentAssignment.sources.length > 0 && (
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
          const checked = isSelected(entry.ref)

          if (isMulti) {
            // Multi-select with checkboxes
            return (
              <button
                key={refKey(entry.ref)}
                onClick={() => toggleItem(entry.ref)}
                className={`w-full text-left px-3 py-2 rounded-lg transition-colors flex items-center gap-2 ${
                  checked
                    ? 'bg-indigo-50 ring-1 ring-indigo-200'
                    : 'hover:bg-slate-50'
                }`}
              >
                <div
                  className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                    checked
                      ? 'bg-indigo-600 border-indigo-600'
                      : 'border-slate-300 bg-white'
                  }`}
                >
                  {checked && <Check size={10} className="text-white" />}
                </div>
                <Icon size={14} className="text-slate-400 shrink-0" />
                <span className="text-xs text-slate-700 truncate">
                  {entry.ref.label}
                </span>
              </button>
            )
          }

          // Single-select: click to assign immediately
          return (
            <button
              key={refKey(entry.ref)}
              onClick={() => {
                assignSlot(slot.slotId, [entry.ref])
                onClose()
              }}
              className={`w-full text-left px-3 py-2 rounded-lg transition-colors flex items-center gap-2 ${
                checked
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
                  key={refKey(entry.ref)}
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

      {/* Done button for multi-select */}
      {isMulti && (
        <div className="px-3 py-2 border-t border-slate-100 bg-slate-50">
          <button
            onClick={handleDone}
            className="w-full px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors"
          >
            Done ({selected.length} selected)
          </button>
        </div>
      )}
    </div>
  )
}
