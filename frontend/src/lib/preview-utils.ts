import type {
  NodeOutputRef,
  SlotContentType,
  SlotAssignment,
  PlatformTemplate,
} from '@/types/preview'
import { FileText, Image, Music, Video, Braces } from 'lucide-react'
import type { PreviewNodeState } from '@/components/preview/PreviewDataContext'
import type { WorkflowRunOutputs } from '@/lib/fastapi/workflows'

/** Resolve a single NodeOutputRef to its raw value */
export function resolveRef(
  ref: NodeOutputRef,
  nodes: Record<string, { outputs: Record<string, unknown> | null }>
): unknown | undefined {
  const node = nodes[ref.nodeId]
  if (!node?.outputs) return undefined
  const val = node.outputs[ref.outputKey]
  if (val === undefined) return undefined
  if (ref.arrayIndex !== undefined && Array.isArray(val)) {
    if (ref.arrayIndex < 0 || ref.arrayIndex >= val.length) return undefined
    return val[ref.arrayIndex]
  }
  return val
}

/** Resolve slot value from assignment and nodes; returns value and stale flag */
export function resolveSlotValue(
  assignment: SlotAssignment,
  nodes: Record<string, { outputs: Record<string, unknown> | null }>,
  slotAcceptsTypes: string[]
): { value: unknown; stale: boolean } {
  if (assignment.sources.length === 0) return { value: null, stale: false }

  const isMediaSlot =
    slotAcceptsTypes.includes('image') || slotAcceptsTypes.includes('video')

  const resolved: unknown[] = []
  let anyStale = false

  for (const ref of assignment.sources) {
    const val = resolveRef(ref, nodes)
    if (val === undefined) {
      anyStale = true
    } else {
      resolved.push(val)
    }
  }

  if (resolved.length === 0) return { value: null, stale: anyStale }

  if (isMediaSlot) return { value: resolved[0], stale: anyStale }
  if (resolved.length === 1) return { value: resolved[0], stale: anyStale }
  return { value: resolved, stale: anyStale }
}

/** Detect if URL points to video content */
export function isVideoUrl(url: string): boolean {
  return /\.(mp4|webm|mov|avi)(\?|$)/i.test(url) || /\/videos?\//i.test(url)
}

/** Extract a serializable string from a resolved value for draft storage */
function valueToDraftString(val: unknown): string | null {
  if (val == null) return null
  if (typeof val === 'string') return val
  if (typeof val === 'object' && 'image_url' in (val as Record<string, unknown>)) {
    const url = (val as Record<string, unknown>).image_url
    return typeof url === 'string' ? url : null
  }
  if (Array.isArray(val)) {
    return val
      .map((item) => {
        if (typeof item === 'string') return item
        if (item && typeof item === 'object' && 'text' in (item as Record<string, unknown>))
          return String((item as Record<string, unknown>).text)
        if (item && typeof item === 'object' && 'caption' in (item as Record<string, unknown>))
          return String((item as Record<string, unknown>).caption)
        return JSON.stringify(item)
      })
      .join('\n\n')
  }
  return JSON.stringify(val)
}

/** Build slot_content for draft creation from config assignments and nodes */
export function buildSlotContentForDraft(
  assignments: SlotAssignment[],
  nodes: Record<string, { outputs: Record<string, unknown> | null }>,
  template: PlatformTemplate
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const slot of template.slots) {
    const assignment = assignments.find((a) => a.slotId === slot.slotId)
    if (!assignment?.sources?.length) continue
    const isMedia = slot.acceptsTypes.includes('image') || slot.acceptsTypes.includes('video')
    const resolved: unknown[] = []
    for (const ref of assignment.sources) {
      const v = resolveRef(ref, nodes)
      if (v !== undefined) resolved.push(v)
    }
    if (resolved.length === 0) continue
    const raw = isMedia ? resolved[0] : resolved.length === 1 ? resolved[0] : resolved
    const str = valueToDraftString(raw)
    if (str != null) out[slot.slotId] = str
  }
  return out
}

/** Canonical icon map for slot content types */
export const CONTENT_TYPE_ICONS: Record<SlotContentType, React.ElementType> = {
  text: FileText,
  image: Image,
  audio: Music,
  video: Video,
  json: Braces,
}

/** Build a unique string key for a NodeOutputRef */
export function refKey(ref: NodeOutputRef): string {
  const base = `${ref.nodeId}:${ref.outputKey}`
  return ref.arrayIndex !== undefined ? `${base}:${ref.arrayIndex}` : base
}

/** Structural equality check for NodeOutputRef */
export function refsEqual(a: NodeOutputRef, b: NodeOutputRef): boolean {
  return (
    a.nodeId === b.nodeId &&
    a.outputKey === b.outputKey &&
    a.arrayIndex === b.arrayIndex
  )
}

/** Convert workflow run outputs to preview node state */
export function buildPersistedNodes(
  runOutputs: WorkflowRunOutputs
): Record<string, PreviewNodeState> {
  const nodeTypeMap = new Map<string, string>()
  const nodes = runOutputs.blueprint_snapshot?.nodes
  if (nodes && Array.isArray(nodes)) {
    for (const node of nodes) {
      if (node && typeof node === 'object' && node.node_id && node.type) {
        nodeTypeMap.set(node.node_id, node.type)
      }
    }
  }

  const next: Record<string, PreviewNodeState> = {}
  for (const [nodeId, outputs] of Object.entries(runOutputs.node_outputs ?? {})) {
    next[nodeId] = {
      id: nodeId,
      type: nodeTypeMap.get(nodeId) ?? 'Unknown',
      status: 'completed',
      outputs,
    }
  }
  return next
}
