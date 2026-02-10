'use client'

import { RunSelector } from './RunSelector'
import type { WorkflowRunSummary } from '@/lib/fastapi/workflows'

interface DraftModeSidebarProps {
  runs: WorkflowRunSummary[]
  selectedRunId: string | null
  onSelectRun: (id: string | null) => void
  runsLoading?: boolean
}

export function DraftModeSidebar({
  runs,
  selectedRunId,
  onSelectRun,
  runsLoading,
}: DraftModeSidebarProps) {
  const hasRuns = runs.length > 0

  return (
    <div className="w-72 border-r border-slate-200 bg-slate-50 flex flex-col h-full">
      <div className="px-4 py-3 border-b border-slate-200 bg-white">
        <h2 className="text-sm font-semibold text-slate-800">Viewing draft</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Select a run to assign outputs and build new drafts
        </p>
      </div>
      <div className="flex-1 p-4">
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-2">
              Switch to run
            </label>
            <RunSelector
              runs={runs}
              selectedId={selectedRunId}
              onChange={onSelectRun}
              disabled={runsLoading}
              dropdownAlign="left"
            />
          </div>
          {!hasRuns && !runsLoading && (
            <p className="text-xs text-slate-400">
              Run the workflow first to see outputs here.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
