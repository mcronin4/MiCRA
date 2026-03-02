import { create } from 'zustand'
import type {
  PreviewConfig,
  SlotAssignment,
  NodeOutputRef,
  PreviewContextId,
} from '@/types/preview'
import {
  LINKEDIN_TEMPLATE,
  PLATFORM_TEMPLATES,
  migrateAssignment,
  LIVE_PREVIEW_CONTEXT_ID,
} from '@/types/preview'

function legacyStorageKey(workflowId: string) {
  return `preview_config_${workflowId}`
}

function storageKey(workflowId: string, contextId: PreviewContextId) {
  return `preview_config_${workflowId}_${contextId}`
}

function loadConfig(workflowId: string, contextId: PreviewContextId): PreviewConfig | null {
  if (typeof window === 'undefined') return null
  try {
    let raw = localStorage.getItem(storageKey(workflowId, contextId))

    // Backward compatibility: pre-output-tab contexts were stored without "::output_key".
    if (!raw && contextId.includes('::')) {
      const legacyContextId = contextId.split('::')[0]
      raw = localStorage.getItem(storageKey(workflowId, legacyContextId))
    }

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

function saveConfig(config: PreviewConfig, contextId: PreviewContextId) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(storageKey(config.workflowId, contextId), JSON.stringify(config))
  } catch {
    // localStorage full or unavailable
  }
}

function migrateLegacyConfigToLive(workflowId: string) {
  if (typeof window === 'undefined') return
  try {
    const liveKey = storageKey(workflowId, LIVE_PREVIEW_CONTEXT_ID)
    if (localStorage.getItem(liveKey)) return

    const raw = localStorage.getItem(legacyStorageKey(workflowId))
    if (!raw) return

    const parsed = JSON.parse(raw) as PreviewConfig
    if (parsed.assignments) {
      parsed.assignments = parsed.assignments.map(migrateAssignment)
    }
    localStorage.setItem(liveKey, JSON.stringify(parsed))
  } catch {
    // Ignore malformed legacy payloads.
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
  activeWorkflowId: string | null
  activeContextId: PreviewContextId

  /** Load config from localStorage or create default */
  loadPreviewConfig: (workflowId: string, contextId: PreviewContextId) => void

  /** Set active workflow/context pair and load config */
  setActiveContext: (workflowId: string, contextId: PreviewContextId) => void

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

  /** Set config from a draft (tone, platform) - does not persist, used when viewing draft */
  setConfigFromDraft: (workflowId: string, platformId: string, tone: string) => void
}

export const usePreviewStore = create<PreviewStore>((set, get) => ({
  config: null,
  activeWorkflowId: null,
  activeContextId: LIVE_PREVIEW_CONTEXT_ID,

  loadPreviewConfig: (workflowId, contextId) => {
    if (contextId === LIVE_PREVIEW_CONTEXT_ID) {
      migrateLegacyConfigToLive(workflowId)
    }
    const saved = loadConfig(workflowId, contextId)
    const config = saved ?? defaultConfig(workflowId)
    set({ config, activeWorkflowId: workflowId, activeContextId: contextId })
  },

  setActiveContext: (workflowId, contextId) => {
    get().loadPreviewConfig(workflowId, contextId)
  },

  assignSlot: (slotId, sources) => {
    const { config, activeContextId } = get()
    if (!config) return

    const updated: PreviewConfig = {
      ...config,
      assignments: config.assignments.map((a) =>
        a.slotId === slotId ? { ...a, sources } : a
      ),
      updatedAt: Date.now(),
    }
    saveConfig(updated, activeContextId)
    set({ config: updated })
  },

  clearSlot: (slotId) => {
    const { config, activeContextId } = get()
    if (!config) return

    const updated: PreviewConfig = {
      ...config,
      assignments: config.assignments.map((a) =>
        a.slotId === slotId ? { ...a, sources: [] } : a
      ),
      updatedAt: Date.now(),
    }
    saveConfig(updated, activeContextId)
    set({ config: updated })
  },

  setPlatform: (platformId) => {
    const { config, activeContextId } = get()
    if (!config) return

    const updated: PreviewConfig = {
      ...config,
      platformId,
      updatedAt: Date.now(),
    }
    saveConfig(updated, activeContextId)
    set({ config: updated })
  },

  setTone: (tone) => {
    const { config, activeContextId } = get()
    if (!config) return

    const updated: PreviewConfig = {
      ...config,
      tone,
      updatedAt: Date.now(),
    }
    saveConfig(updated, activeContextId)
    set({ config: updated })
  },

  getAssignment: (slotId) => {
    const { config } = get()
    if (!config) return undefined
    return config.assignments.find((a) => a.slotId === slotId)
  },

  resetConfig: () => {
    const { config, activeContextId } = get()
    if (!config) return
    const fresh = defaultConfig(config.workflowId)
    saveConfig(fresh, activeContextId)
    set({ config: fresh })
  },

  setConfigFromDraft: (workflowId, platformId, tone) => {
    const template = PLATFORM_TEMPLATES[platformId] ?? LINKEDIN_TEMPLATE
    set({
      config: {
        workflowId,
        platformId,
        tone,
        assignments: template.slots.map((slot) => ({
          slotId: slot.slotId,
          sources: [],
        })),
        updatedAt: Date.now(),
      },
    })
  },
}))
