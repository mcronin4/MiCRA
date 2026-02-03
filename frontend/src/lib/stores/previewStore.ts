import { create } from 'zustand'
import type { PreviewConfig, SlotAssignment, NodeOutputRef } from '@/types/preview'
import { LINKEDIN_TEMPLATE } from '@/types/preview'

function storageKey(workflowId: string) {
  return `preview_config_${workflowId}`
}

function loadConfig(workflowId: string): PreviewConfig | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(storageKey(workflowId))
    if (!raw) return null
    return JSON.parse(raw) as PreviewConfig
  } catch {
    return null
  }
}

function saveConfig(config: PreviewConfig) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(storageKey(config.workflowId), JSON.stringify(config))
  } catch {
    // localStorage full or unavailable
  }
}

function defaultConfig(workflowId: string): PreviewConfig {
  return {
    workflowId,
    platformId: 'linkedin',
    assignments: LINKEDIN_TEMPLATE.slots.map((slot) => ({
      slotId: slot.slotId,
      source: null,
    })),
    tone: 'professional',
    updatedAt: Date.now(),
  }
}

interface PreviewStore {
  config: PreviewConfig | null

  /** Load config from localStorage or create default */
  loadPreviewConfig: (workflowId: string) => void

  /** Assign an output to a slot */
  assignSlot: (slotId: string, source: NodeOutputRef) => void

  /** Clear a slot assignment */
  clearSlot: (slotId: string) => void

  /** Set the active platform */
  setPlatform: (platformId: string) => void

  /** Set the tone */
  setTone: (tone: string) => void

  /** Get assignment for a specific slot */
  getAssignment: (slotId: string) => SlotAssignment | undefined

  /** Reset config */
  resetConfig: () => void
}

export const usePreviewStore = create<PreviewStore>((set, get) => ({
  config: null,

  loadPreviewConfig: (workflowId) => {
    const saved = loadConfig(workflowId)
    const config = saved ?? defaultConfig(workflowId)
    set({ config })
  },

  assignSlot: (slotId, source) => {
    const { config } = get()
    if (!config) return

    const updated: PreviewConfig = {
      ...config,
      assignments: config.assignments.map((a) =>
        a.slotId === slotId ? { ...a, source } : a
      ),
      updatedAt: Date.now(),
    }
    saveConfig(updated)
    set({ config: updated })
  },

  clearSlot: (slotId) => {
    const { config } = get()
    if (!config) return

    const updated: PreviewConfig = {
      ...config,
      assignments: config.assignments.map((a) =>
        a.slotId === slotId ? { ...a, source: null } : a
      ),
      updatedAt: Date.now(),
    }
    saveConfig(updated)
    set({ config: updated })
  },

  setPlatform: (platformId) => {
    const { config } = get()
    if (!config) return

    const updated: PreviewConfig = {
      ...config,
      platformId,
      updatedAt: Date.now(),
    }
    saveConfig(updated)
    set({ config: updated })
  },

  setTone: (tone) => {
    const { config } = get()
    if (!config) return

    const updated: PreviewConfig = {
      ...config,
      tone,
      updatedAt: Date.now(),
    }
    saveConfig(updated)
    set({ config: updated })
  },

  getAssignment: (slotId) => {
    const { config } = get()
    if (!config) return undefined
    return config.assignments.find((a) => a.slotId === slotId)
  },

  resetConfig: () => {
    const { config } = get()
    if (!config) return
    const fresh = defaultConfig(config.workflowId)
    saveConfig(fresh)
    set({ config: fresh })
  },
}))
