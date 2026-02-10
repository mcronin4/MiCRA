'use client'

import { createContext, useContext } from 'react'

/**
 * PreviewNodeState represents a node's state in the preview context.
 * This is a simplified subset of WorkflowNodeState, containing only the fields
 * needed for preview/display purposes from persisted run outputs.
 * 
 * Unlike WorkflowNodeState (used for live workflow execution), PreviewNodeState:
 * - Does NOT include `inputs` (not needed for preview)
 * - Does NOT include `error` (status conveys error state)
 * - Does NOT include `manualInputEnabled` (not applicable to persisted outputs)
 * 
 * This interface is intentionally minimal to represent historical execution data.
 */
export interface PreviewNodeState {
  id: string
  type: string
  status: 'idle' | 'pending' | 'running' | 'completed' | 'error'
  outputs: Record<string, unknown> | null
}

export interface PreviewDataContextValue {
  nodes: Record<string, PreviewNodeState>
  outputsLoading?: boolean
  /** When viewing a draft: raw slot content (body, media). Keys = slotId. */
  slotContent?: Record<string, unknown>
  isDraftMode?: boolean
  onDraftSlotChange?: (slotId: string, value: unknown) => void
}

const PreviewDataContext = createContext<PreviewDataContextValue>({
  nodes: {},
  slotContent: undefined,
  isDraftMode: false,
})

export function PreviewDataProvider({
  value,
  children,
}: {
  value: PreviewDataContextValue
  children: React.ReactNode
}) {
  return (
    <PreviewDataContext.Provider value={value}>
      {children}
    </PreviewDataContext.Provider>
  )
}

export function usePreviewData() {
  return useContext(PreviewDataContext)
}
