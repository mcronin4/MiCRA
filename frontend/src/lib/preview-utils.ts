import type { NodeOutputRef, SlotContentType } from '@/types/preview'
import { FileText, Image, Music, Video, Braces } from 'lucide-react'

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
