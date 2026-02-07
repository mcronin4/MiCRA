'use client'

import { useEffect, useMemo } from 'react'
import Link from 'next/link'
import { ArrowLeft, RefreshCw, Loader2 } from 'lucide-react'
import { useWorkflowStore } from '@/lib/stores/workflowStore'
import { usePreviewStore } from '@/lib/stores/previewStore'
import { useWorkflowExecution } from '@/hooks/useWorkflowExecution'
import { TONE_OPTIONS } from '@/types/preview'
import { OutputsSidebar } from './OutputsSidebar'
import { PreviewEmptyState } from './PreviewEmptyState'
import { PlatformSelector } from './PlatformSelector'
import { LinkedInMockup } from './mockups/LinkedInMockup'
import { PreviewDndContext } from './PreviewDndContext'

interface PreviewPageProps {
  workflowId: string
}

export function PreviewPage({ workflowId }: PreviewPageProps) {
  const loadPreviewConfig = usePreviewStore((s) => s.loadPreviewConfig)
  const config = usePreviewStore((s) => s.config)
  const setTone = usePreviewStore((s) => s.setTone)
  const setPlatform = usePreviewStore((s) => s.setPlatform)
  const nodes = useWorkflowStore((s) => s.nodes)
  const workflowName = useWorkflowStore((s) => s.workflowName)
  const currentWorkflowId = useWorkflowStore((s) => s.currentWorkflowId)
  const { executeById, isExecuting } = useWorkflowExecution()

  // Load config from localStorage on mount
  useEffect(() => {
    loadPreviewConfig(workflowId)
  }, [workflowId, loadPreviewConfig])

  // Check if any node has completed outputs
  const hasOutputs = useMemo(() => {
    return Object.values(nodes).some(
      (n) => n.status === 'completed' && n.outputs
    )
  }, [nodes])

  // Check if the store has this workflow loaded
  const isWorkflowLoaded = currentWorkflowId === workflowId

  const handleToneChange = (newTone: string) => {
    setTone(newTone)
    // Tone preference is saved but not injected into execution yet.
    // Full tone injection requires a backend endpoint change (future work).
  }

  // Show empty state if no workflow loaded or no outputs (but not while executing)
  if (!isWorkflowLoaded || (!hasOutputs && !isExecuting)) {
    return (
      <div className="h-screen flex flex-col bg-white">
        <PreviewHeader workflowName={workflowName} />
        <PreviewEmptyState />
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-white">
      <PreviewHeader workflowName={workflowName} />

      <PreviewDndContext>
        <div className="flex-1 flex overflow-hidden">
          {/* Left sidebar: outputs */}
          <OutputsSidebar />

          {/* Main mockup area */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Toolbar: platform selector + tone */}
            <div className="flex items-center justify-between px-6 py-3 border-b border-slate-200 bg-slate-50/50">
              <PlatformSelector
                activePlatform={config?.platformId ?? 'linkedin'}
                onSelect={setPlatform}
              />

              <div className="flex items-center gap-3">
                {/* Tone selector */}
                <div className="flex items-center gap-2">
                  <label className="text-xs text-slate-500">Tone:</label>
                  <select
                    value={config?.tone ?? 'professional'}
                    onChange={(e) => handleToneChange(e.target.value)}
                    disabled={isExecuting}
                    className="text-xs border border-slate-200 rounded-md px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                  >
                    {TONE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Re-run button */}
                <button
                  onClick={() =>
                    currentWorkflowId && executeById(currentWorkflowId).catch(() => {})
                  }
                  disabled={isExecuting}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors disabled:opacity-50"
                >
                  <RefreshCw
                    size={12}
                    className={isExecuting ? 'animate-spin' : ''}
                  />
                  {isExecuting ? 'Running...' : 'Re-run'}
                </button>
              </div>
            </div>

            {/* Mockup */}
            <div className="flex-1 overflow-y-auto p-8 bg-slate-50/30 relative">
              {(config?.platformId ?? 'linkedin') === 'linkedin' && (
                <LinkedInMockup />
              )}

              {/* Loading overlay during execution */}
              {isExecuting && (
                <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] flex items-center justify-center z-10 pointer-events-none">
                  <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg shadow-md border border-slate-200">
                    <Loader2 size={16} className="animate-spin text-indigo-500" />
                    <span className="text-sm text-slate-600">Re-running workflow…</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </PreviewDndContext>
    </div>
  )
}

function PreviewHeader({
  workflowName,
}: {
  workflowName: string
}) {
  return (
    <div className="h-12 bg-white border-b border-slate-100 flex items-center justify-between px-4 shrink-0">
      <div className="flex items-center gap-3">
        <Link
          href="/"
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
        >
          <ArrowLeft size={16} />
          Editor
        </Link>
        <span className="text-slate-300">/</span>
        <span className="text-sm font-medium text-slate-800">
          {workflowName} — Preview
        </span>
      </div>
    </div>
  )
}
