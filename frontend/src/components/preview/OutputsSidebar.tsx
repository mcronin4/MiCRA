'use client'

import { useMemo } from 'react'
import { useWorkflowStore, type ImageBucketItem } from '@/lib/stores/workflowStore'
import { usePreviewStore } from '@/lib/stores/previewStore'
import { NODE_REGISTRY } from '@/lib/nodeRegistry'
import { runtimeTypeToSlotContentType } from '@/types/preview'
import type { NodeOutputRef, SlotContentType } from '@/types/preview'
import { refKey } from '@/lib/preview-utils'
import { getImageSrc } from '@/lib/utils/imageUtils'
import { OutputBlock } from './OutputBlock'
import {
  Image,
  Music,
  Video,
  FileText,
  Sparkles,
  Mic,
  Layers,
  Film,
  TextQuote,
  Flag,
} from 'lucide-react'
import { usePreviewData } from './PreviewDataContext'

/** Input bucket node types - excluded from preview as they are seed info, not workflow outputs */
const BUCKET_NODE_TYPES = ['ImageBucket', 'AudioBucket', 'VideoBucket', 'TextBucket']

const NODE_TYPE_ICONS: Record<string, React.ElementType> = {
  ImageBucket: Image,
  AudioBucket: Music,
  VideoBucket: Video,
  TextBucket: FileText,
  TextGeneration: Sparkles,
  ImageGeneration: Image,
  Transcription: Mic,
  ImageMatching: Image,
  ImageExtraction: Film,
  QuoteExtraction: TextQuote,
  End: Flag,
}

export interface OutputEntry {
  ref: NodeOutputRef
  contentType: SlotContentType
  value: unknown
}

export interface NodeGroup {
  nodeId: string
  nodeType: string
  icon: React.ElementType
  outputs: OutputEntry[]
}

/** Generate a preview label for an array item */
function itemLabel(nodeType: string, outputKey: string, index: number, item: unknown): string {
  if (nodeType === 'QuoteExtraction' && item && typeof item === 'object' && 'text' in item) {
    const text = (item as Record<string, unknown>).text as string
    const preview = text.length > 40 ? text.slice(0, 37) + '...' : text
    return `Quote #${index + 1}: ${preview}`
  }
  if (nodeType === 'ImageMatching' && item && typeof item === 'object') {
    const obj = item as Record<string, unknown>
    const score = (obj._matchScore ?? obj.similarity_score ?? obj.combined_score ?? obj.score ?? obj.similarity) as number | undefined
    if (typeof score === 'number' && score > 0) {
      const pct = Math.round(score * 100)
      const caption = typeof obj._caption === 'string' && obj._caption
        ? ` — ${obj._caption.length > 25 ? obj._caption.slice(0, 22) + '...' : obj._caption}`
        : ''
      return `Image #${index + 1} — ${pct}% match${caption}`
    }
    if (obj.status === 'failed' || obj.error) {
      return `Image #${index + 1} — failed`
    }
    return `Image #${index + 1}`
  }
  if (nodeType === 'TextBucket') {
    if (typeof item === 'string') {
      const preview = item.length > 40 ? item.slice(0, 37) + '...' : item
      return `Text #${index + 1}: ${preview}`
    }
    return `Text #${index + 1}`
  }
  return `${outputKey} #${index + 1}`
}

/** Enrich an ImageMatching result item with image URL from bucket if needed */
function enrichImageMatchItem(
  item: Record<string, unknown>,
  imageBucket: ImageBucketItem[],
): Record<string, unknown> {
  // Workflow mode: item already has image_url — normalize score field
  if (typeof item.image_url === 'string') {
    return {
      ...item,
      _matchScore: (item.similarity_score ?? item.combined_score ?? 0) as number,
      _caption: (item.caption ?? '') as string,
    }
  }

  // Manual test mode: item has image_id, resolve from bucket
  if (typeof item.image_id === 'string') {
    const bucketItem = imageBucket.find((img) => img.id === item.image_id)
    const imageUrl = bucketItem ? getImageSrc(bucketItem) : ''
    return {
      ...item,
      image_url: imageUrl,
      _matchScore: (item.combined_score ?? item.similarity_score ?? 0) as number,
      _caption: '',
    }
  }

  return item
}

export function useNodeOutputs(): NodeGroup[] {
  const { nodes } = usePreviewData()
  const imageBucket = useWorkflowStore((s) => s.imageBucket)

  return useMemo(() => {
    const groups: NodeGroup[] = []

    // Suppress ImageExtraction when ImageMatching is completed
    const hasCompletedImageMatching = Object.values(nodes).some(
      (n) => n.type === 'ImageMatching' && n.status === 'completed' && n.outputs
    )

    for (const [nodeId, node] of Object.entries(nodes)) {
      if (BUCKET_NODE_TYPES.includes(node.type)) continue
      if (node.status !== 'completed' || !node.outputs) continue

      // Skip ImageExtraction when ImageMatching consolidates its images
      if (node.type === 'ImageExtraction' && hasCompletedImageMatching) continue

      const spec = NODE_REGISTRY[node.type]
      if (!spec) continue

      const isImageMatching = node.type === 'ImageMatching'
      const entries: OutputEntry[] = []

      for (const portSpec of spec.outputs) {
        // For ImageMatching, also check 'results' key (manual test mode stores under 'results')
        let val = node.outputs[portSpec.key]
        let actualOutputKey = portSpec.key
        if (isImageMatching && (val === undefined || val === null)) {
          val = node.outputs['results']
          if (val !== undefined && val !== null) {
            actualOutputKey = 'results'
          }
        }
        if (val === undefined || val === null) continue

        // Override contentType to 'image' for ImageMatching so items can drop on media slots
        const contentType = isImageMatching ? 'image' : runtimeTypeToSlotContentType(portSpec.runtime_type)
        const shortId = nodeId.split('-').pop() ?? nodeId

        // Expand array values into individual items
        if (Array.isArray(val) && val.length > 0) {
          for (let i = 0; i < val.length; i++) {
            // Enrich ImageMatching items with image URL and normalized score
            const item = isImageMatching && val[i] && typeof val[i] === 'object'
              ? enrichImageMatchItem(val[i] as Record<string, unknown>, imageBucket)
              : val[i]

            entries.push({
              ref: {
                nodeId,
                nodeType: node.type,
                outputKey: actualOutputKey,
                label: itemLabel(node.type, portSpec.key, i, item),
                arrayIndex: i,
              },
              contentType,
              value: item,
            })
          }
        } else {
          entries.push({
            ref: {
              nodeId,
              nodeType: node.type,
              outputKey: actualOutputKey,
              label: `${node.type} (${shortId}) — ${portSpec.key}`,
            },
            contentType,
            value: val,
          })
        }
      }

      if (entries.length > 0) {
        groups.push({
          nodeId,
          nodeType: node.type,
          icon: NODE_TYPE_ICONS[node.type] ?? Layers,
          outputs: entries,
        })
      }
    }

    return groups
  }, [nodes, imageBucket])
}

function OutputBlockSkeleton({ index }: { index: number }) {
  const isWide = index % 3 === 0
  return (
    <div
      className="px-3 py-2.5 rounded-lg border border-slate-100 bg-white"
      style={{ animationDelay: `${index * 120}ms` }}
    >
      <div className="flex items-center gap-2 mb-2">
        <div className="w-3 h-3 rounded skeleton-shimmer shrink-0" style={{ animationDelay: `${index * 80}ms` }} />
        <div className="w-3.5 h-3.5 rounded skeleton-shimmer shrink-0" style={{ animationDelay: `${index * 80 + 40}ms` }} />
        <div
          className="h-3 rounded-md skeleton-shimmer"
          style={{
            width: isWide ? '75%' : '55%',
            animationDelay: `${index * 80 + 80}ms`,
          }}
        />
      </div>
      <div className="pl-[26px]">
        <div
          className="h-8 rounded-md skeleton-shimmer"
          style={{
            width: index % 2 === 0 ? '100%' : '85%',
            animationDelay: `${index * 80 + 120}ms`,
          }}
        />
      </div>
    </div>
  )
}

function SidebarSkeletonGroup({ groupIndex }: { groupIndex: number }) {
  const itemCount = groupIndex === 0 ? 3 : 2
  return (
    <div style={{ animationDelay: `${groupIndex * 200}ms` }}>
      <div className="flex items-center gap-2 mb-2">
        <div className="w-3.5 h-3.5 rounded skeleton-shimmer" style={{ animationDelay: `${groupIndex * 150}ms` }} />
        <div className="h-3 w-20 rounded-md skeleton-shimmer" style={{ animationDelay: `${groupIndex * 150 + 60}ms` }} />
      </div>
      <div className="space-y-1.5">
        {Array.from({ length: itemCount }, (_, i) => (
          <OutputBlockSkeleton key={i} index={groupIndex * 3 + i} />
        ))}
      </div>
    </div>
  )
}

export function OutputsSidebar() {
  const groups = useNodeOutputs()
  const config = usePreviewStore((s) => s.config)
  const { outputsLoading } = usePreviewData()

  const assignedKeys = useMemo(() => {
    const set = new Set<string>()
    if (!config) return set
    for (const a of config.assignments) {
      for (const src of a.sources) {
        set.add(refKey(src))
      }
    }
    return set
  }, [config])

  const showSkeleton = outputsLoading && groups.length === 0

  return (
    <div className="w-72 border-r border-slate-200 bg-slate-50 flex flex-col h-full overflow-x-hidden">
      <div className="px-4 py-3 border-b border-slate-200 bg-white">
        <h2 className="text-sm font-semibold text-slate-800">Node Outputs</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          {showSkeleton ? 'Loading outputs…' : 'Drag to slots or click to assign'}
        </p>
      </div>
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 space-y-4">
        {showSkeleton && (
          <>
            <SidebarSkeletonGroup groupIndex={0} />
            <SidebarSkeletonGroup groupIndex={1} />
          </>
        )}
        {!showSkeleton && groups.length === 0 && (
          <p className="text-xs text-slate-400 text-center mt-8">
            No completed outputs. Run the workflow first.
          </p>
        )}
        {groups.map((group) => {
          const Icon = group.icon
          return (
            <div key={group.nodeId}>
              <div className="flex items-center gap-2 mb-2">
                <Icon size={14} className="text-slate-500" />
                <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                  {group.nodeType}
                </span>
              </div>
              <div className="space-y-1.5">
                {group.outputs.map((entry) => {
                  const key = refKey(entry.ref)
                  return (
                    <OutputBlock
                      key={key}
                      output={entry.ref}
                      contentType={entry.contentType}
                      value={entry.value}
                      isAssigned={assignedKeys.has(key)}
                    />
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
