'use client'

import { useMemo } from 'react'
import { useWorkflowStore } from '@/lib/stores/workflowStore'
import { usePreviewStore } from '@/lib/stores/previewStore'
import { NODE_REGISTRY } from '@/lib/nodeRegistry'
import { runtimeTypeToSlotContentType } from '@/types/preview'
import type { NodeOutputRef, SlotContentType } from '@/types/preview'
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

const NODE_TYPE_ICONS: Record<string, React.ElementType> = {
  ImageBucket: Image,
  AudioBucket: Music,
  VideoBucket: Video,
  TextBucket: FileText,
  TextGeneration: Sparkles,
  ImageGeneration: Image,
  Transcription: Mic,
  ImageMatching: Layers,
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

export function useNodeOutputs(): NodeGroup[] {
  const nodes = useWorkflowStore((s) => s.nodes)

  return useMemo(() => {
    const groups: NodeGroup[] = []

    for (const [nodeId, node] of Object.entries(nodes)) {
      if (node.status !== 'completed' || !node.outputs) continue

      const spec = NODE_REGISTRY[node.type]
      if (!spec) continue

      const entries: OutputEntry[] = []

      for (const portSpec of spec.outputs) {
        const val = node.outputs[portSpec.key]
        if (val === undefined || val === null) continue

        const contentType = runtimeTypeToSlotContentType(portSpec.runtime_type)
        const shortId = nodeId.split('-').pop() ?? nodeId

        entries.push({
          ref: {
            nodeId,
            nodeType: node.type,
            outputKey: portSpec.key,
            label: `${node.type} (${shortId}) — ${portSpec.key}`,
          },
          contentType,
          value: val,
        })
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
  }, [nodes])
}

export function OutputsSidebar() {
  const groups = useNodeOutputs()
  const config = usePreviewStore((s) => s.config)

  const assignedKeys = useMemo(() => {
    const set = new Set<string>()
    if (!config) return set
    for (const a of config.assignments) {
      if (a.source) {
        set.add(`${a.source.nodeId}:${a.source.outputKey}`)
      }
    }
    return set
  }, [config])

  return (
    <div className="w-72 border-r border-slate-200 bg-slate-50 flex flex-col h-full">
      <div className="px-4 py-3 border-b border-slate-200 bg-white">
        <h2 className="text-sm font-semibold text-slate-800">Node Outputs</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Click a slot in the mockup, then pick an output
        </p>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {groups.length === 0 && (
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
                  const key = `${entry.ref.nodeId}:${entry.ref.outputKey}`
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
