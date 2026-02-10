'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronDown, FileEdit } from 'lucide-react'
import type { PreviewDraftListItem } from '@/lib/fastapi/workflows'

interface DraftSelectorProps {
  drafts: PreviewDraftListItem[]
  selectedId: string | null
  onChange: (id: string | null) => void
  disabled?: boolean
}

function timeAgo(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = now - then
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

export function DraftSelector({
  drafts,
  selectedId,
  onChange,
  disabled,
}: DraftSelectorProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const selected = drafts.find((d) => d.id === selectedId) ?? null

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const isEmpty = drafts.length === 0

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={disabled || isEmpty}
        onClick={() => setOpen((v) => !v)}
        className="
          group flex items-center gap-2 pl-2.5 pr-2 py-1.5
          text-xs rounded-lg border
          bg-white border-slate-200
          hover:border-slate-300 hover:bg-slate-50/80
          focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 focus-visible:border-indigo-400
          disabled:opacity-40 disabled:cursor-not-allowed
          transition-all duration-150
          min-w-[180px] max-w-[240px]
        "
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {selected ? (
          <>
            <FileEdit size={12} className="text-slate-500 shrink-0" />
            <span className="truncate text-slate-700 font-medium">
              {selected.name}
            </span>
            <span className="ml-auto text-[10px] text-slate-400 shrink-0">
              {timeAgo(selected.updated_at)}
            </span>
          </>
        ) : isEmpty ? (
          <span className="text-slate-400">No drafts</span>
        ) : (
          <span className="text-slate-400">
            {drafts.length === 1 ? '1 draft' : `${drafts.length} drafts`}
          </span>
        )}
        <ChevronDown
          size={13}
          className={`shrink-0 text-slate-400 transition-transform duration-200 ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {open && (
        <div
          className="
            absolute right-0 top-full mt-1.5 z-50
            w-[300px] max-h-[280px]
            bg-white rounded-xl
            border border-slate-200/80
            shadow-lg shadow-slate-900/8
            overflow-hidden
          "
          role="listbox"
        >
          <div className="px-3 py-2 border-b border-slate-100 bg-slate-50/60">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Drafts
            </span>
          </div>
          <div className="overflow-y-auto max-h-[220px] py-1">
            {drafts.map((draft) => (
              <button
                key={draft.id}
                type="button"
                role="option"
                aria-selected={draft.id === selectedId}
                onClick={() => {
                  onChange(draft.id)
                  setOpen(false)
                }}
                className={`
                  w-full flex items-start gap-2 px-3 py-2.5
                  text-left transition-colors cursor-pointer
                  hover:bg-slate-50
                  ${draft.id === selectedId ? 'bg-indigo-50/60' : ''}
                `}
              >
                <FileEdit size={14} className="text-slate-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-slate-800 truncate">
                    {draft.name}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {formatDate(draft.updated_at)}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
