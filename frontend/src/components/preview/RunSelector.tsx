'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown, Check, Clock, AlertCircle, Package } from 'lucide-react'
import type { WorkflowRunSummary } from '@/lib/fastapi/workflows'

interface RunSelectorProps {
  runs: WorkflowRunSummary[]
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

function formatRunDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

function formatRunTime(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  })
}

export function RunSelector({ runs, selectedId, onChange, disabled }: RunSelectorProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [focusIdx, setFocusIdx] = useState(-1)

  const selected = runs.find((r) => r.execution_id === selectedId) ?? null

  // Close on outside click
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

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!open) {
        if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          setOpen(true)
          setFocusIdx(runs.findIndex((r) => r.execution_id === selectedId))
        }
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setFocusIdx((i) => Math.min(i + 1, runs.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setFocusIdx((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        if (focusIdx >= 0 && focusIdx < runs.length) {
          onChange(runs[focusIdx].execution_id)
          setOpen(false)
        }
      }
    },
    [open, focusIdx, runs, selectedId, onChange]
  )

  // Scroll focused item into view
  useEffect(() => {
    if (!open || focusIdx < 0) return
    const list = listRef.current
    if (!list) return
    const item = list.children[focusIdx] as HTMLElement | undefined
    item?.scrollIntoView({ block: 'nearest' })
  }, [open, focusIdx])

  const isEmpty = runs.length === 0

  return (
    <div ref={containerRef} className="relative" onKeyDown={handleKeyDown}>
      {/* Trigger */}
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
          min-w-[220px] max-w-[280px]
        "
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {selected ? (
          <>
            <span
              className={`shrink-0 w-1.5 h-1.5 rounded-full ${
                selected.success ? 'bg-emerald-500' : 'bg-red-500'
              }`}
            />
            <span className="truncate text-slate-700 font-medium tabular-nums">
              {formatRunDate(selected.created_at)}{' '}
              <span className="text-slate-400 font-normal">at</span>{' '}
              {formatRunTime(selected.created_at)}
            </span>
            <span className="ml-auto text-[10px] text-slate-400 font-normal shrink-0">
              {timeAgo(selected.created_at)}
            </span>
          </>
        ) : (
          <span className="text-slate-400">No runs yet</span>
        )}
        <ChevronDown
          size={13}
          className={`shrink-0 text-slate-400 transition-transform duration-200 ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          className="
            absolute right-0 top-full mt-1.5 z-50
            w-[340px] max-h-[320px]
            bg-white rounded-xl
            border border-slate-200/80
            shadow-lg shadow-slate-900/8
            overflow-hidden
            animate-in fade-in slide-in-from-top-1 duration-150
          "
          role="listbox"
        >
          {/* Header */}
          <div className="px-3 py-2 border-b border-slate-100 bg-slate-50/60">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Run History
            </span>
          </div>

          {/* Items */}
          <div ref={listRef} className="overflow-y-auto max-h-[268px] py-1">
            {runs.map((run, idx) => {
              const isSelected = run.execution_id === selectedId
              const isFocused = idx === focusIdx
              const hasOutputs = run.has_persisted_outputs

              return (
                <button
                  key={run.execution_id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    onChange(run.execution_id)
                    setOpen(false)
                  }}
                  onMouseEnter={() => setFocusIdx(idx)}
                  className={`
                    w-full flex items-start gap-2.5 px-3 py-2.5
                    text-left transition-colors duration-100 cursor-pointer
                    ${isFocused ? 'bg-slate-50' : ''}
                    ${isSelected ? 'bg-indigo-50/60' : ''}
                  `}
                >
                  {/* Status indicator */}
                  <div className="pt-0.5 shrink-0">
                    {run.success ? (
                      <div className="w-5 h-5 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center">
                        <Check size={10} className="text-emerald-600" strokeWidth={3} />
                      </div>
                    ) : (
                      <div className="w-5 h-5 rounded-full bg-red-50 border border-red-200 flex items-center justify-center">
                        <AlertCircle size={10} className="text-red-500" strokeWidth={3} />
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium text-slate-800 tabular-nums">
                        {formatRunDate(run.created_at)} at {formatRunTime(run.created_at)}
                      </span>
                      {isSelected && (
                        <span className="text-[9px] font-semibold uppercase tracking-wide bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full leading-none">
                          current
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span
                        className={`text-[11px] font-medium ${
                          run.success ? 'text-emerald-600' : 'text-red-500'
                        }`}
                      >
                        {run.success ? 'Completed' : 'Failed'}
                      </span>
                      {run.total_execution_time_ms > 0 && (
                        <>
                          <span className="text-slate-300">·</span>
                          <span className="text-[11px] text-slate-400 flex items-center gap-0.5">
                            <Clock size={9} />
                            {run.total_execution_time_ms < 1000
                              ? `${run.total_execution_time_ms}ms`
                              : `${(run.total_execution_time_ms / 1000).toFixed(1)}s`}
                          </span>
                        </>
                      )}
                      {!hasOutputs && (
                        <>
                          <span className="text-slate-300">·</span>
                          <span className="text-[11px] text-amber-500 flex items-center gap-0.5">
                            <Package size={9} />
                            no outputs
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Time ago */}
                  <span className="text-[10px] text-slate-400 shrink-0 pt-0.5 tabular-nums">
                    {timeAgo(run.created_at)}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
