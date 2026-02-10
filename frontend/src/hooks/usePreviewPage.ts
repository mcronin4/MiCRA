'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useWorkflowStore } from '@/lib/stores/workflowStore'
import { usePreviewStore } from '@/lib/stores/previewStore'
import { useWorkflowExecution } from '@/hooks/useWorkflowExecution'
import { LIVE_PREVIEW_CONTEXT_ID, PLATFORM_TEMPLATES } from '@/types/preview'
import {
  getWorkflowRunOutputs,
  listWorkflowRuns,
  listPreviewDrafts,
  createPreviewDraft,
  getPreviewDraft,
  updatePreviewDraft,
  deletePreviewDraft,
  type WorkflowRunSummary,
  type PreviewDraftListItem,
} from '@/lib/fastapi/workflows'
import {
  buildPersistedNodes,
  buildSlotContentForDraft,
} from '@/lib/preview-utils'
import type { PreviewNodeState } from '@/components/preview/PreviewDataContext'

const AUTOSAVE_DEBOUNCE_MS = 800
const AUTOSAVED_DISPLAY_MS = 2500

export function usePreviewPage(workflowId: string) {
  const setActiveContext = usePreviewStore((s) => s.setActiveContext)
  const setConfigFromDraft = usePreviewStore((s) => s.setConfigFromDraft)
  const config = usePreviewStore((s) => s.config)
  const setTone = usePreviewStore((s) => s.setTone)
  const nodes = useWorkflowStore((s) => s.nodes)
  const { executeById, isExecuting } = useWorkflowExecution()

  // Run selection
  const [runs, setRuns] = useState<WorkflowRunSummary[]>([])
  const [selectedExecutionId, setSelectedExecutionId] = useState<string | null>(null)
  const [runsLoading, setRunsLoading] = useState(false)
  const [runsError, setRunsError] = useState<string | null>(null)

  // Draft selection
  const [drafts, setDrafts] = useState<PreviewDraftListItem[]>([])
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null)
  const [draftsLoading, setDraftsLoading] = useState(false)

  // Outputs / content
  const [draftSlotContent, setDraftSlotContent] = useState<Record<string, unknown>>({})
  const [persistedNodes, setPersistedNodes] = useState<Record<string, PreviewNodeState>>({})
  const [outputsLoading, setOutputsLoading] = useState(false)
  const [runNotice, setRunNotice] = useState<string | null>(null)

  // Draft modal & save
  const [saveDraftModalOpen, setSaveDraftModalOpen] = useState(false)
  const [savingDraft, setSavingDraft] = useState(false)

  // Draft autosave
  const [updatingDraft, setUpdatingDraft] = useState(false)
  const [autosavedAt, setAutosavedAt] = useState<number | null>(null)
  const [autosaveFadingOut, setAutosaveFadingOut] = useState(false)
  const updateDraftTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autosavedClearRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const refreshRuns = useCallback(async (preferLatest = false) => {
    setRunsLoading(true)
    try {
      const items = await listWorkflowRuns(workflowId)
      setRuns(items)
      setRunsError(null)
      setSelectedExecutionId((prev) => {
        if (preferLatest) return items[0]?.execution_id ?? null
        if (prev && items.some((r) => r.execution_id === prev)) return prev
        return items[0]?.execution_id ?? null
      })
    } catch (err) {
      setRunsError(err instanceof Error ? err.message : 'Failed to load run history')
      setRuns([])
      setSelectedExecutionId(null)
    } finally {
      setRunsLoading(false)
    }
  }, [workflowId])

  const refreshDrafts = useCallback(async () => {
    setDraftsLoading(true)
    try {
      const items = await listPreviewDrafts(workflowId)
      setDrafts(items)
    } catch {
      setDrafts([])
    } finally {
      setDraftsLoading(false)
    }
  }, [workflowId])

  useEffect(() => {
    refreshRuns(true).catch(() => {})
  }, [refreshRuns])

  useEffect(() => {
    refreshDrafts().catch(() => {})
  }, [refreshDrafts])

  const selectedRun = useMemo(
    () => runs.find((r) => r.execution_id === selectedExecutionId) ?? null,
    [runs, selectedExecutionId]
  )

  const isViewingDraft = selectedDraftId !== null
  const activePreviewContextId = isViewingDraft
    ? `draft_${selectedDraftId}`
    : selectedRun?.execution_id ?? LIVE_PREVIEW_CONTEXT_ID

  useEffect(() => {
    if (!isViewingDraft) {
      setActiveContext(workflowId, activePreviewContextId)
    }
  }, [workflowId, activePreviewContextId, setActiveContext, isViewingDraft])

  // Load draft content when draft selected
  useEffect(() => {
    if (!selectedDraftId) return
    setOutputsLoading(true)
    let cancelled = false
    getPreviewDraft(workflowId, selectedDraftId)
      .then((draft) => {
        if (cancelled) return
        setDraftSlotContent(draft.slot_content ?? {})
        setConfigFromDraft(workflowId, draft.platform_id, draft.tone)
      })
      .catch(() => {
        if (cancelled) return
        setDraftSlotContent({})
      })
      .finally(() => {
        if (!cancelled) setOutputsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [workflowId, selectedDraftId, setConfigFromDraft])

  // Load run outputs when run selected
  useEffect(() => {
    if (!selectedRun) {
      setPersistedNodes({})
      setRunNotice(null)
      return
    }
    if (!selectedRun.has_persisted_outputs) {
      setPersistedNodes({})
      setRunNotice('This run has no persisted outputs (older run or payload exceeded persistence limit).')
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
        setRunNotice(err instanceof Error ? err.message : 'Failed to load run outputs')
        setPersistedNodes({})
      })
      .finally(() => {
        if (!cancelled) setOutputsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [workflowId, selectedRun])

  const handleRunSelect = useCallback((id: string | null) => {
    setSelectedExecutionId(id)
    setSelectedDraftId(null)
  }, [])

  const handleDraftSelect = useCallback((id: string | null) => {
    setSelectedDraftId(id)
    setSelectedExecutionId(null)
  }, [])

  const draftSlotContentRef = useRef(draftSlotContent)
  draftSlotContentRef.current = draftSlotContent

  const handleDraftSlotChange = useCallback(
    (slotId: string, value: unknown) => {
      if (!selectedDraftId) return
      const next = { ...draftSlotContentRef.current, [slotId]: value }
      setDraftSlotContent(next)

      if (updateDraftTimeoutRef.current) clearTimeout(updateDraftTimeoutRef.current)
      updateDraftTimeoutRef.current = setTimeout(() => {
        setUpdatingDraft(true)
        setAutosavedAt(null)
        setAutosaveFadingOut(false)
        if (autosavedClearRef.current) {
          clearTimeout(autosavedClearRef.current)
          autosavedClearRef.current = null
        }
        updatePreviewDraft(workflowId, selectedDraftId, { slot_content: next })
          .then(() => refreshDrafts())
          .finally(() => {
            setUpdatingDraft(false)
            updateDraftTimeoutRef.current = null
            setAutosavedAt(Date.now())
            if (autosavedClearRef.current) clearTimeout(autosavedClearRef.current)
            autosavedClearRef.current = setTimeout(() => {
              setAutosavedAt(null)
              autosavedClearRef.current = null
            }, AUTOSAVED_DISPLAY_MS)
          })
      }, AUTOSAVE_DEBOUNCE_MS)
    },
    [workflowId, selectedDraftId, refreshDrafts]
  )

  useEffect(() => {
    return () => {
      if (updateDraftTimeoutRef.current) clearTimeout(updateDraftTimeoutRef.current)
      if (autosavedClearRef.current) clearTimeout(autosavedClearRef.current)
    }
  }, [])

  useEffect(() => {
    if (!selectedDraftId) {
      setAutosavedAt(null)
      setAutosaveFadingOut(false)
    }
  }, [selectedDraftId])

  const platformId = config?.platformId ?? 'linkedin'
  const template = PLATFORM_TEMPLATES[platformId] ?? PLATFORM_TEMPLATES.linkedin

  const handleSaveAsDraft = useCallback(async (name: string) => {
    if (!selectedRun?.has_persisted_outputs) return
    setSavingDraft(true)
    try {
      const outputs = await getWorkflowRunOutputs(workflowId, selectedRun.execution_id)
      const nodesForResolve = buildPersistedNodes(outputs)
      const assignments = usePreviewStore.getState().config?.assignments ?? []
      const slotContent = buildSlotContentForDraft(assignments, nodesForResolve, template)
      const draft = await createPreviewDraft(workflowId, {
        name,
        execution_id: selectedRun.execution_id,
        platform_id: platformId,
        tone: config?.tone ?? 'professional',
        slot_content: slotContent,
      })
      setSaveDraftModalOpen(false)
      setDraftSlotContent(draft.slot_content ?? {})
      setSelectedDraftId(draft.id)
      setSelectedExecutionId(null)
      setConfigFromDraft(workflowId, draft.platform_id, draft.tone)
      await refreshDrafts()
    } catch (err) {
      setRunNotice(err instanceof Error ? err.message : 'Failed to save draft')
    } finally {
      setSavingDraft(false)
    }
  }, [workflowId, selectedRun, config?.tone, platformId, template, setConfigFromDraft, refreshDrafts])

  const handleDeleteDraft = useCallback(async () => {
    if (!selectedDraftId) return
    try {
      await deletePreviewDraft(workflowId, selectedDraftId)
      setSelectedDraftId(null)
      setDraftSlotContent({})
      await refreshDrafts()
      if (runs.length > 0 && runs[0]?.execution_id) {
        setSelectedExecutionId(runs[0].execution_id)
      }
    } catch {
      setRunNotice('Failed to delete draft')
    }
  }, [workflowId, selectedDraftId, refreshDrafts, runs])

  const handleToneChange = useCallback(
    (newTone: string) => {
      if (isViewingDraft && selectedDraftId) {
        setConfigFromDraft(workflowId, platformId, newTone)
        updatePreviewDraft(workflowId, selectedDraftId, { tone: newTone })
          .then(() => refreshDrafts())
          .catch(() => setRunNotice('Failed to update tone'))
      } else {
        setTone(newTone)
      }
    },
    [isViewingDraft, selectedDraftId, workflowId, platformId, setTone, setConfigFromDraft, refreshDrafts]
  )

  const handleRerun = useCallback(async () => {
    setPersistedNodes({})
    try {
      const result = await executeById(workflowId)
      if (result?.persistence_warning) setRunNotice(result.persistence_warning)
      await refreshRuns(true)
    } catch {
      // Errors surfaced by execution hook
    }
  }, [workflowId, executeById, refreshRuns])

  const inMemoryHasOutputs = useMemo(
    () => Object.values(nodes).some((n) => n.status === 'completed' && n.outputs),
    [nodes]
  )
  const persistedHasOutputs = useMemo(
    () => Object.values(persistedNodes).some((n) => n.status === 'completed' && n.outputs),
    [persistedNodes]
  )

  const isViewingRun = selectedRun !== null
  const displayNodes = isViewingRun ? persistedNodes : nodes
  const hasOutputs = isViewingDraft
    ? true
    : isViewingRun
      ? persistedHasOutputs
      : inMemoryHasOutputs
  const hasAnyRuns = runs.length > 0
  const hasAnyDrafts = drafts.length > 0

  const isInitialLoading =
    runsLoading ||
    (outputsLoading &&
      ((selectedRun !== null && Object.keys(persistedNodes).length === 0) ||
        (selectedDraftId !== null && Object.keys(draftSlotContent).length === 0)))

  return {
    // Display
    displayNodes,
    hasOutputs,
    hasAnyRuns,
    hasAnyDrafts,
    isInitialLoading,
    isViewingDraft,
    isExecuting,
    outputsLoading,

    // Runs
    runs,
    selectedExecutionId,
    runsLoading,
    runsError,
    refreshRuns,
    handleRunSelect,
    selectedRun,

    // Drafts
    drafts,
    selectedDraftId,
    draftsLoading,
    draftSlotContent,
    refreshDrafts,
    handleDraftSelect,
    handleDraftSlotChange,
    updatingDraft,
    autosavedAt,
    autosaveFadingOut,

    // Modals & actions
    saveDraftModalOpen,
    setSaveDraftModalOpen,
    savingDraft,
    handleSaveAsDraft,
    handleDeleteDraft,
    handleToneChange,
    handleRerun,

    // Notices
    runNotice,

    // Config (for toolbar, mockup)
    config,
  }
}
