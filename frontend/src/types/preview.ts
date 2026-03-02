export interface NodeOutputRef {
  nodeId: string
  nodeType: string
  outputKey: string
  label: string
  arrayIndex?: number  // undefined = whole output, number = specific item
}

export type SlotContentType = 'text' | 'image' | 'audio' | 'video'

export interface TemplateSlot {
  slotId: string
  label: string
  acceptsTypes: SlotContentType[]
  required: boolean
  /** Max characters for text slots (e.g. LinkedIn 3000, X 280). Omit = no limit. */
  maxChars?: number
}

export interface SlotAssignment {
  slotId: string
  sources: NodeOutputRef[]
}

/** Legacy format for localStorage migration */
interface LegacySlotAssignment {
  slotId: string
  source: NodeOutputRef | null
}

/** Migrate legacy single-source assignment to multi-source */
export function migrateAssignment(raw: SlotAssignment | LegacySlotAssignment): SlotAssignment {
  if ('sources' in raw && Array.isArray(raw.sources)) return raw as SlotAssignment
  const legacy = raw as LegacySlotAssignment
  return {
    slotId: legacy.slotId,
    sources: legacy.source ? [legacy.source] : [],
  }
}

export interface PlatformTemplate {
  platformId: string
  platformLabel: string
  slots: TemplateSlot[]
}

export interface PreviewConfig {
  workflowId: string
  platformId: string
  assignments: SlotAssignment[]
  tone: string
  updatedAt: number
}

export const LIVE_PREVIEW_CONTEXT_ID = '__live__' as const
export type PreviewContextId = string | typeof LIVE_PREVIEW_CONTEXT_ID

export const LINKEDIN_TEMPLATE: PlatformTemplate = {
  platformId: 'linkedin',
  platformLabel: 'LinkedIn',
  slots: [
    {
      slotId: 'body',
      label: 'Body',
      acceptsTypes: ['text'],
      required: true,
      maxChars: 3000,
    },
    {
      slotId: 'media',
      label: 'Media',
      acceptsTypes: ['image', 'video'],
      required: false,
    },
  ],
}

export const X_TEMPLATE: PlatformTemplate = {
  platformId: 'x',
  platformLabel: 'X',
  slots: [
    {
      slotId: 'body',
      label: 'Post',
      acceptsTypes: ['text'],
      required: true,
      maxChars: 280,
    },
    {
      slotId: 'media',
      label: 'Media',
      acceptsTypes: ['image', 'video'],
      required: false,
    },
  ],
}

export const EMAIL_TEMPLATE: PlatformTemplate = {
  platformId: 'email',
  platformLabel: 'Email',
  slots: [
    {
      slotId: 'subject',
      label: 'Subject',
      acceptsTypes: ['text'],
      required: true,
      maxChars: 120,
    },
    {
      slotId: 'body',
      label: 'Body',
      acceptsTypes: ['text'],
      required: true,
    },
    {
      slotId: 'media',
      label: 'Media',
      acceptsTypes: ['image'],
      required: false,
    },
  ],
}

/** Registry of platform templates for slot resolution and draft building */
export const PLATFORM_TEMPLATES: Record<string, PlatformTemplate> = {
  linkedin: LINKEDIN_TEMPLATE,
  x: X_TEMPLATE,
  email: EMAIL_TEMPLATE,
}

export const TONE_OPTIONS = [
  { value: 'professional', label: 'Professional' },
  { value: 'friendly', label: 'Friendly' },
  { value: 'concise', label: 'Concise' },
  { value: 'persuasive', label: 'Persuasive' },
] as const

/** Map NODE_REGISTRY RuntimeType to SlotContentType */
export function runtimeTypeToSlotContentType(runtimeType: string): SlotContentType {
  switch (runtimeType) {
    case 'Text':
      return 'text'
    case 'ImageRef':
      return 'image'
    case 'AudioRef':
      return 'audio'
    case 'VideoRef':
      return 'video'
    // Legacy guard for persisted runs produced before primitive-only rollout.
    case 'JSON':
      return 'text'
    default:
      return 'text'
  }
}
