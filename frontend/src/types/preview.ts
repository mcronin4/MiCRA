export interface NodeOutputRef {
  nodeId: string
  nodeType: string
  outputKey: string
  label: string
  arrayIndex?: number  // undefined = whole output, number = specific item
}

export type SlotContentType = 'text' | 'image' | 'audio' | 'video' | 'json'

export interface TemplateSlot {
  slotId: string
  label: string
  acceptsTypes: SlotContentType[]
  required: boolean
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

export const LINKEDIN_TEMPLATE: PlatformTemplate = {
  platformId: 'linkedin',
  platformLabel: 'LinkedIn',
  slots: [
    {
      slotId: 'headline',
      label: 'Headline',
      acceptsTypes: ['text', 'json'],
      required: false,
    },
    {
      slotId: 'body',
      label: 'Body',
      acceptsTypes: ['text', 'json'],
      required: true,
    },
    {
      slotId: 'media',
      label: 'Media',
      acceptsTypes: ['image', 'video'],
      required: false,
    },
    {
      slotId: 'caption',
      label: 'Caption',
      acceptsTypes: ['text', 'json'],
      required: false,
    },
  ],
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
    case 'JSON':
      return 'json'
    default:
      return 'text'
  }
}
