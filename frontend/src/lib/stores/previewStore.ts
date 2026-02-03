import { create } from 'zustand'
import type { PreviewConfig, SlotAssignment, NodeOutputRef } from '@/types/preview'
import { LINKEDIN_TEMPLATE, migrateAssignment } from '@/types/preview'

function storageKey(workflowId: string) {
  return `preview_config_${workflowId}`
}

function loadConfig(workflowId: string): PreviewConfig | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(storageKey(workflowId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as PreviewConfig
    // Migrate legacy single-source assignments to multi-source
    if (parsed.assignments) {
      parsed.assignments = parsed.assignments.map(migrateAssignment)
    }
    return parsed
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
      sources: [],
    })),
    tone: 'professional',
    updatedAt: Date.now(),
  }
}

interface PreviewStore {
  config: PreviewConfig | null

  /** Load config from localStorage or create default */
  loadPreviewConfig: (workflowId: string) => void

  /** Assign outputs to a slot (replaces all sources) */
  assignSlot: (slotId: string, sources: NodeOutputRef[]) => void

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

  assignSlot: (slotId, sources) => {
    const { config } = get()
    if (!config) return

    const updated: PreviewConfig = {
      ...config,
      assignments: config.assignments.map((a) =>
        a.slotId === slotId ? { ...a, sources } : a
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
        a.slotId === slotId ? { ...a, sources: [] } : a
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
