'use client'

import Link from 'next/link'
import { ArrowLeft, RefreshCw, Loader2, Save, Trash2, Check } from 'lucide-react'
import { useWorkflowStore } from '@/lib/stores/workflowStore'
import { usePreviewStore } from '@/lib/stores/previewStore'
import { usePreviewPage } from '@/hooks/usePreviewPage'
import { TONE_OPTIONS } from '@/types/preview'
import { OutputsSidebar } from './OutputsSidebar'
import { DraftModeSidebar } from './DraftModeSidebar'
import { PreviewEmptyState } from './PreviewEmptyState'
import { PreviewPageSkeleton } from '@/components/preview/PreviewPageSkeleton'
import { PlatformSelector } from './PlatformSelector'
import { getMockupForPlatform } from './mockups'
import { PreviewDndContext } from './PreviewDndContext'
import { PreviewDataProvider } from './PreviewDataContext'
import { RunSelector } from './RunSelector'
import { DraftSelector } from './DraftSelector'
import { SaveDraftModal } from './SaveDraftModal'

interface PreviewPageProps {
  workflowId: string
}

export function PreviewPage({ workflowId }: PreviewPageProps) {
  const setPlatform = usePreviewStore((s) => s.setPlatform)
  const workflowName = useWorkflowStore((s) => s.workflowName)
  const currentWorkflowId = useWorkflowStore((s) => s.currentWorkflowId)

  const {
    displayNodes,
    hasOutputs,
    hasAnyRuns,
    hasAnyDrafts,
    isInitialLoading,
    isViewingDraft,
    isExecuting,
    outputsLoading,
    outputTabs,
    activeOutputKey,
    setActiveOutputKey,
    runs,
    selectedExecutionId,
    runsLoading,
    runsError,
    handleRunSelect,
    selectedRun,
    drafts,
    selectedDraftId,
    draftsLoading,
    draftSlotContent,
    handleDraftSelect,
    handleDraftSlotChange,
    updatingDraft,
    autosavedAt,
    autosaveFadingOut,
    saveDraftModalOpen,
    setSaveDraftModalOpen,
    savingDraft,
    handleSaveAsDraft,
    handleDeleteDraft,
    handleToneChange,
    handleRerun,
    runNotice,
    config,
  } = usePreviewPage(workflowId)

  const platformId = config?.platformId ?? 'linkedin'
  const MockupComponent = getMockupForPlatform(platformId)

  const headerName =
    currentWorkflowId === workflowId ? workflowName : `Workflow ${workflowId.slice(0, 8)}`

  if (isInitialLoading) {
    return (
      <div className="h-screen flex flex-col bg-white">
        <PreviewHeader workflowName={headerName} />
        <PreviewPageSkeleton />
      </div>
    )
  }

  if (!hasOutputs && !isExecuting && !hasAnyRuns && !hasAnyDrafts) {
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

      <PreviewDataProvider
        value={{
          nodes: displayNodes,
          outputsLoading: outputsLoading || isExecuting,
          slotContent: isViewingDraft ? draftSlotContent : undefined,
          isDraftMode: isViewingDraft,
          onDraftSlotChange: isViewingDraft ? handleDraftSlotChange : undefined,
        }}
      >
        <PreviewDndContext>
          <div className="flex-1 flex overflow-hidden">
            {isViewingDraft ? (
              <DraftModeSidebar
                runs={runs}
                selectedRunId={selectedExecutionId}
                onSelectRun={handleRunSelect}
                runsLoading={runsLoading}
              />
            ) : (
              <OutputsSidebar />
            )}

            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex items-center gap-4 px-6 py-3 border-b border-slate-200 bg-slate-50/50 min-w-0">
                <div className="shrink-0">
                  <PlatformSelector
                    activePlatform={platformId}
                    onSelect={setPlatform}
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2 min-w-0 flex-1 justify-end overflow-x-auto">
                  <div className="flex items-center gap-2 shrink-0">
                    <label className="text-xs text-slate-500 shrink-0">Run:</label>
                    <RunSelector
                      runs={runs}
                      selectedId={selectedExecutionId}
                      onChange={handleRunSelect}
                      disabled={runsLoading}
                    />
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
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
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors disabled:opacity-50 shrink-0"
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

              {outputTabs.length > 1 && (
                <div className="px-6 py-2 border-b border-slate-200 bg-white">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">Outputs:</span>
                    <div className="flex items-center gap-1 overflow-x-auto">
                      {outputTabs.map((outputKey) => (
                        <button
                          key={outputKey}
                          onClick={() => setActiveOutputKey(outputKey)}
                          className={`px-2.5 py-1 text-xs rounded-md border transition-colors whitespace-nowrap ${
                            activeOutputKey === outputKey
                              ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          {outputKey}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div className="flex-1 overflow-y-auto p-8 bg-slate-50/30 relative">
                <MockupComponent
                  footerContent={
                    isViewingDraft &&
                    selectedDraftId &&
                    (updatingDraft || autosavedAt || autosaveFadingOut) ? (
                      <span
                        className={`
                          flex items-center gap-1.5 text-xs transition-opacity duration-300
                          ${updatingDraft ? 'text-slate-500' : 'text-emerald-600'}
                          ${autosaveFadingOut ? 'opacity-0' : 'opacity-100'}
                        `}
                      >
                        {updatingDraft ? (
                          <>
                            <Loader2 size={12} className="animate-spin" />
                            Saving…
                          </>
                        ) : (
                          <>
                            <Check size={12} />
                            Autosaved
                          </>
                        )}
                      </span>
                    ) : null
                  }
                  headerActions={
                    <>
                      <DraftSelector
                        drafts={drafts}
                        selectedId={selectedDraftId}
                        onChange={handleDraftSelect}
                        disabled={draftsLoading}
                      />
                      {!isViewingDraft && (
                        <button
                          onClick={() => setSaveDraftModalOpen(true)}
                          disabled={
                            isExecuting ||
                            !selectedRun?.has_persisted_outputs ||
                            !config?.assignments?.some((a) => a.sources.length > 0)
                          }
                          title={
                            !selectedRun?.has_persisted_outputs
                              ? 'Select a run with outputs first'
                              : !config?.assignments?.some((a) => a.sources.length > 0)
                                ? 'Assign content to slots first'
                                : 'Save current preview as draft'
                          }
                          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border border-indigo-300 text-indigo-600 hover:bg-indigo-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Save size={12} />
                          Save as draft
                        </button>
                      )}
                      {isViewingDraft && selectedDraftId && (
                        <button
                          onClick={handleDeleteDraft}
                          disabled={updatingDraft}
                          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                        >
                          <Trash2 size={12} />
                          Delete draft
                        </button>
                      )}
                    </>
                  }
                />

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

      <SaveDraftModal
        isOpen={saveDraftModalOpen}
        onClose={() => setSaveDraftModalOpen(false)}
        onSave={handleSaveAsDraft}
        isSaving={savingDraft}
      />
    </div>
  )
}

function PreviewHeader({ workflowName }: { workflowName: string }) {
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
