'use client'

import { createContext, useContext } from 'react'

export interface PreviewNodeState {
  id: string
  type: string
  status: 'idle' | 'pending' | 'running' | 'completed' | 'error'
  outputs: Record<string, unknown> | null
}

interface PreviewDataContextValue {
  nodes: Record<string, PreviewNodeState>
  outputsLoading?: boolean
}

const PreviewDataContext = createContext<PreviewDataContextValue>({
  nodes: {},
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
