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
  parseDraftSlotContentByOutput,
  buildDraftSlotContentPayload,
  type DraftSlotContentByOutput,
} from '@/lib/preview-utils'
import type { PreviewNodeState } from '@/components/preview/PreviewDataContext'

const AUTOSAVE_DEBOUNCE_MS = 800
const AUTOSAVED_DISPLAY_MS = 2500
const DEFAULT_OUTPUT_KEY = 'output_1'

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
  const [draftSlotContentByOutput, setDraftSlotContentByOutput] =
    useState<DraftSlotContentByOutput>({})
  const [persistedNodes, setPersistedNodes] = useState<Record<string, PreviewNodeState>>({})
  const [runWorkflowOutputs, setRunWorkflowOutputs] =
    useState<Record<string, unknown>>({})
  const [outputsLoading, setOutputsLoading] = useState(false)
  const [runNotice, setRunNotice] = useState<string | null>(null)

  // Output tabs
  const [activeOutputKey, setActiveOutputKey] = useState<string>(DEFAULT_OUTPUT_KEY)

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
  const activePreviewContextBase = isViewingDraft
    ? `draft_${selectedDraftId}`
    : selectedRun?.execution_id ?? LIVE_PREVIEW_CONTEXT_ID
  const activePreviewContextId = `${activePreviewContextBase}::${activeOutputKey}`

  useEffect(() => {
    if (!isViewingDraft) {
      setActiveContext(workflowId, activePreviewContextId)
    }
  }, [workflowId, activePreviewContextId, setActiveContext, isViewingDraft])

  // Load draft content when draft selected
  useEffect(() => {
    if (!selectedDraftId) {
      setDraftSlotContentByOutput({})
      return
    }

    setOutputsLoading(true)
    let cancelled = false
    getPreviewDraft(workflowId, selectedDraftId)
      .then((draft) => {
        if (cancelled) return

        const rawDefaultKey =
          draft.slot_content && typeof draft.slot_content.default_output_key === 'string'
            ? draft.slot_content.default_output_key
            : null
        const fallbackKey = rawDefaultKey || activeOutputKey || DEFAULT_OUTPUT_KEY
        const parsedByOutput = parseDraftSlotContentByOutput(
          draft.slot_content ?? {},
          fallbackKey
        )

        setDraftSlotContentByOutput(parsedByOutput)
        const availableKeys = Object.keys(parsedByOutput)
        if (rawDefaultKey) {
          setActiveOutputKey(rawDefaultKey)
        } else if (availableKeys.length > 0 && !availableKeys.includes(activeOutputKey)) {
          setActiveOutputKey(availableKeys[0])
        }

        setConfigFromDraft(workflowId, draft.platform_id, draft.tone)
      })
      .catch(() => {
        if (cancelled) return
        setDraftSlotContentByOutput({})
      })
      .finally(() => {
        if (!cancelled) setOutputsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [workflowId, selectedDraftId, setConfigFromDraft, activeOutputKey])

  // Load run outputs when run selected
  useEffect(() => {
    if (!selectedRun) {
      setPersistedNodes({})
      setRunWorkflowOutputs({})
      setRunNotice(null)
      return
    }

    if (!selectedRun.has_persisted_outputs) {
      setPersistedNodes({})
      setRunWorkflowOutputs({})
      setRunNotice(null)
      return
    }

    setPersistedNodes({})
    setRunWorkflowOutputs({})
    setOutputsLoading(true)
    let cancelled = false

    getWorkflowRunOutputs(workflowId, selectedRun.execution_id)
      .then((outputs) => {
        if (cancelled) return
        setPersistedNodes(buildPersistedNodes(outputs))
        setRunWorkflowOutputs(outputs.workflow_outputs ?? {})
        setRunNotice(null)
      })
      .catch((err) => {
        if (cancelled) return
        setRunNotice(err instanceof Error ? err.message : 'Failed to load run outputs')
        setPersistedNodes({})
        setRunWorkflowOutputs({})
      })
      .finally(() => {
        if (!cancelled) setOutputsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [workflowId, selectedRun])

  const runOutputKeys = useMemo(() => {
    const keys = Object.keys(runWorkflowOutputs)
    return keys.length > 0 ? keys : []
  }, [runWorkflowOutputs])

  const draftOutputKeys = useMemo(() => {
    const keys = Object.keys(draftSlotContentByOutput)
    return keys.length > 0 ? keys : []
  }, [draftSlotContentByOutput])

  const outputTabs = useMemo(() => {
    const keys = isViewingDraft ? draftOutputKeys : runOutputKeys
    if (keys.length > 0) return keys
    if (isViewingDraft && runOutputKeys.length > 0) return runOutputKeys
    return [DEFAULT_OUTPUT_KEY]
  }, [isViewingDraft, draftOutputKeys, runOutputKeys])

  useEffect(() => {
    if (outputTabs.length === 0) return
    if (!outputTabs.includes(activeOutputKey)) {
      setActiveOutputKey(outputTabs[0])
    }
  }, [outputTabs, activeOutputKey])

  const handleRunSelect = useCallback((id: string | null) => {
    setSelectedExecutionId(id)
    setSelectedDraftId(null)
  }, [])

  const handleDraftSelect = useCallback((id: string | null) => {
    setSelectedDraftId(id)
    setSelectedExecutionId(null)
  }, [])

  const draftSlotContentByOutputRef = useRef(draftSlotContentByOutput)
  draftSlotContentByOutputRef.current = draftSlotContentByOutput

  const activeDraftSlotContent = useMemo(() => {
    return draftSlotContentByOutput[activeOutputKey] ?? {}
  }, [draftSlotContentByOutput, activeOutputKey])

  const handleDraftSlotChange = useCallback(
    (slotId: string, value: unknown) => {
      if (!selectedDraftId) return

      const currentForOutput = draftSlotContentByOutputRef.current[activeOutputKey] ?? {}
      const nextForOutput = { ...currentForOutput, [slotId]: value }
      const nextByOutput = {
        ...draftSlotContentByOutputRef.current,
        [activeOutputKey]: nextForOutput,
      }
      setDraftSlotContentByOutput(nextByOutput)

      if (updateDraftTimeoutRef.current) clearTimeout(updateDraftTimeoutRef.current)
      updateDraftTimeoutRef.current = setTimeout(() => {
        setUpdatingDraft(true)
        setAutosavedAt(null)
        setAutosaveFadingOut(false)

        if (autosavedClearRef.current) {
          clearTimeout(autosavedClearRef.current)
          autosavedClearRef.current = null
        }

        updatePreviewDraft(workflowId, selectedDraftId, {
          slot_content: buildDraftSlotContentPayload(nextByOutput, activeOutputKey),
        })
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
    [workflowId, selectedDraftId, refreshDrafts, activeOutputKey]
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
      const slotContentForOutput = buildSlotContentForDraft(assignments, nodesForResolve, template)
      const slotContentPayload = buildDraftSlotContentPayload(
        { [activeOutputKey]: slotContentForOutput },
        activeOutputKey
      )

      const draft = await createPreviewDraft(workflowId, {
        name,
        execution_id: selectedRun.execution_id,
        platform_id: platformId,
        tone: config?.tone ?? 'professional',
        slot_content: slotContentPayload,
      })

      setSaveDraftModalOpen(false)
      const parsed = parseDraftSlotContentByOutput(draft.slot_content ?? {}, activeOutputKey)
      setDraftSlotContentByOutput(parsed)
      setSelectedDraftId(draft.id)
      setSelectedExecutionId(null)
      setConfigFromDraft(workflowId, draft.platform_id, draft.tone)
      await refreshDrafts()
    } catch (err) {
      setRunNotice(err instanceof Error ? err.message : 'Failed to save draft')
    } finally {
      setSavingDraft(false)
    }
  }, [workflowId, selectedRun, config?.tone, platformId, template, setConfigFromDraft, refreshDrafts, activeOutputKey])

  const handleDeleteDraft = useCallback(async () => {
    if (!selectedDraftId) return

    try {
      await deletePreviewDraft(workflowId, selectedDraftId)
      setSelectedDraftId(null)
      setDraftSlotContentByOutput({})
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
    setRunWorkflowOutputs({})
    setRunNotice(null)
    try {
      await executeById(workflowId)
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
  const shouldUsePersistedRunData = !!selectedRun?.has_persisted_outputs
  const displayNodes = isViewingRun
    ? (shouldUsePersistedRunData ? persistedNodes : nodes)
    : nodes
  const hasOutputs = isViewingDraft
    ? true
    : isViewingRun
      ? (shouldUsePersistedRunData ? persistedHasOutputs : inMemoryHasOutputs)
      : inMemoryHasOutputs
  const hasAnyRuns = runs.length > 0
  const hasAnyDrafts = drafts.length > 0

  const isInitialLoading =
    runsLoading ||
    (outputsLoading &&
      ((shouldUsePersistedRunData && Object.keys(persistedNodes).length === 0) ||
        (selectedDraftId !== null && Object.keys(draftSlotContentByOutput).length === 0)))

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

    // Output tabs
    outputTabs,
    activeOutputKey,
    setActiveOutputKey,

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
    draftSlotContent: activeDraftSlotContent,
    refreshDrafts,
    handleDraftSelect,
    handleDraftSlotChange,

    // Draft autosave status
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
