'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, RefreshCw, Loader2 } from 'lucide-react'
import { useWorkflowStore } from '@/lib/stores/workflowStore'
import { usePreviewStore } from '@/lib/stores/previewStore'
import { useWorkflowExecution } from '@/hooks/useWorkflowExecution'
import { TONE_OPTIONS, LIVE_PREVIEW_CONTEXT_ID } from '@/types/preview'
import {
  getWorkflowRunOutputs,
  listWorkflowRuns,
  type WorkflowRunSummary,
  type WorkflowRunOutputs,
} from '@/lib/fastapi/workflows'
import { OutputsSidebar } from './OutputsSidebar'
import { PreviewEmptyState } from './PreviewEmptyState'
import { PlatformSelector } from './PlatformSelector'
import { LinkedInMockup } from './mockups/LinkedInMockup'
import { PreviewDndContext } from './PreviewDndContext'
import { PreviewDataProvider, type PreviewNodeState } from './PreviewDataContext'
import { RunSelector } from './RunSelector'

interface PreviewPageProps {
  workflowId: string
}

export function buildPersistedNodes(
  runOutputs: WorkflowRunOutputs
): Record<string, PreviewNodeState> {
  const nodeTypeMap = new Map<string, string>()
  
  // Validate blueprint_snapshot structure before accessing nodes
  if (runOutputs.blueprint_snapshot && runOutputs.blueprint_snapshot.nodes) {
    const nodes = runOutputs.blueprint_snapshot.nodes
    if (Array.isArray(nodes)) {
      for (const node of nodes) {
        if (node && typeof node === 'object' && node.node_id && node.type) {
          nodeTypeMap.set(node.node_id, node.type)
        }
      }
    }
  }

  const next: Record<string, PreviewNodeState> = {}
  for (const [nodeId, outputs] of Object.entries(runOutputs.node_outputs ?? {})) {
    next[nodeId] = {
      id: nodeId,
      type: nodeTypeMap.get(nodeId) ?? 'Unknown',
      status: 'completed',
      outputs,
    }
  }
  return next
}

export function PreviewPage({ workflowId }: PreviewPageProps) {
  const setActiveContext = usePreviewStore((s) => s.setActiveContext)
  const config = usePreviewStore((s) => s.config)
  const setTone = usePreviewStore((s) => s.setTone)
  const setPlatform = usePreviewStore((s) => s.setPlatform)
  const nodes = useWorkflowStore((s) => s.nodes)
  const workflowName = useWorkflowStore((s) => s.workflowName)
  const currentWorkflowId = useWorkflowStore((s) => s.currentWorkflowId)
  const { executeById, isExecuting } = useWorkflowExecution()
  const [runs, setRuns] = useState<WorkflowRunSummary[]>([])
  const [selectedExecutionId, setSelectedExecutionId] = useState<string | null>(null)
  const [persistedNodes, setPersistedNodes] = useState<Record<string, PreviewNodeState>>({})
  const [runsLoading, setRunsLoading] = useState(false)
  const [outputsLoading, setOutputsLoading] = useState(false)
  const [runsError, setRunsError] = useState<string | null>(null)
  const [runNotice, setRunNotice] = useState<string | null>(null)

  const refreshRuns = useCallback(async (preferLatest = false) => {
    setRunsLoading(true)
    try {
      const items = await listWorkflowRuns(workflowId)
      setRuns(items)
      setRunsError(null)
      setSelectedExecutionId((prev) => {
        if (preferLatest) {
          return items[0]?.execution_id ?? null
        }
        if (prev && items.some((r) => r.execution_id === prev)) {
          return prev
        }
        return items[0]?.execution_id ?? null
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load run history'
      setRunsError(msg)
      setRuns([])
      setSelectedExecutionId(null)
    } finally {
      setRunsLoading(false)
    }
  }, [workflowId])

  useEffect(() => {
    refreshRuns(true).catch(() => {})
  }, [refreshRuns])

  const selectedRun = useMemo(
    () => runs.find((r) => r.execution_id === selectedExecutionId) ?? null,
    [runs, selectedExecutionId]
  )
  const activePreviewContextId = selectedRun?.execution_id ?? LIVE_PREVIEW_CONTEXT_ID

  useEffect(() => {
    setActiveContext(workflowId, activePreviewContextId)
  }, [workflowId, activePreviewContextId, setActiveContext])

  useEffect(() => {
    if (!selectedRun) {
      setPersistedNodes({})
      setRunNotice(null)
      return
    }

    if (!selectedRun.has_persisted_outputs) {
      setPersistedNodes({})
      setRunNotice(
        'This run has no persisted outputs (older run or payload exceeded persistence limit).'
      )
      return
    }

    setPersistedNodes({})
    setOutputsLoading(true)
    let cancelled = false
    getWorkflowRunOutputs(workflowId, selectedRun.execution_id)
      .then((outputs) => {
        if (cancelled) return
        setPersistedNodes(buildPersistedNodes(outputs))
        setRunNotice(null)
      })
      .catch((err) => {
        if (cancelled) return
        const msg = err instanceof Error ? err.message : 'Failed to load run outputs'
        setPersistedNodes({})
        setRunNotice(msg)
      })
      .finally(() => {
        if (!cancelled) setOutputsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [workflowId, selectedRun])

  const inMemoryHasOutputs = useMemo(() => {
    return Object.values(nodes).some((n) => n.status === 'completed' && n.outputs)
  }, [nodes])

  const persistedHasOutputs = useMemo(() => {
    return Object.values(persistedNodes).some(
      (n) => n.status === 'completed' && n.outputs
    )
  }, [persistedNodes])

  const isViewingRun = selectedRun !== null
  const displayNodes = isViewingRun ? persistedNodes : nodes
  const hasOutputs = isViewingRun ? persistedHasOutputs : inMemoryHasOutputs
  const hasAnyRuns = runs.length > 0

  const handleToneChange = (newTone: string) => {
    setTone(newTone)
  }

  const handleRerun = async () => {
    try {
      const result = await executeById(workflowId)
      if (result?.persistence_warning) {
        setRunNotice(result.persistence_warning)
      }
      await refreshRuns(true)
    } catch {
      // Errors already surfaced by execution hook.
    }
  }

  const headerName =
    currentWorkflowId === workflowId ? workflowName : `Workflow ${workflowId.slice(0, 8)}`

  if (!hasOutputs && !isExecuting && !hasAnyRuns) {
    return (
      <div className="h-screen flex flex-col bg-white">
        <PreviewHeader workflowName={headerName} />
        <PreviewEmptyState />
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-white">
      <PreviewHeader workflowName={headerName} />

      <PreviewDataProvider value={{ nodes: displayNodes, outputsLoading: outputsLoading || isExecuting }}>
        <PreviewDndContext>
          <div className="flex-1 flex overflow-hidden">
            <OutputsSidebar />

            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex items-center justify-between px-6 py-3 border-b border-slate-200 bg-slate-50/50">
                <PlatformSelector
                  activePlatform={config?.platformId ?? 'linkedin'}
                  onSelect={setPlatform}
                />

                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-slate-500">Run:</label>
                    <RunSelector
                      runs={runs}
                      selectedId={selectedExecutionId}
                      onChange={setSelectedExecutionId}
                      disabled={runsLoading}
                    />
                  </div>

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

                  <button
                    onClick={handleRerun}
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

              {(runsError || runNotice) && (
                <div className="px-6 py-2 text-xs border-b border-amber-200 bg-amber-50 text-amber-700">
                  {runsError ?? runNotice}
                </div>
              )}

              <div className="flex-1 overflow-y-auto p-8 bg-slate-50/30 relative">
                {(config?.platformId ?? 'linkedin') === 'linkedin' && (
                  <LinkedInMockup />
                )}

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
      </PreviewDataProvider>
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
