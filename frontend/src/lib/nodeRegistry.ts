/**
 * Client-side node type registry — mirrors the backend node_registry.
 *
 * Used for:
 * - Rendering correct handle types/colors
 * - Local pre-validation before calling backend compile
 */

import type { RuntimeType, RuntimeShape, PortSchema } from '@/types/blueprint'

export interface NodeTypeSpec {
  inputs: PortSchema[]
  outputs: PortSchema[]
  defaultImplementation?: string
}

function port(
  key: string,
  runtime_type: RuntimeType,
  shape: RuntimeShape = 'single',
  required = true,
): PortSchema {
  return { key, runtime_type, shape, required }
}

export const NODE_REGISTRY: Record<string, NodeTypeSpec> = {
  End: {
    inputs: [port('end-input', 'JSON')],
    outputs: [],
  },
  ImageBucket: {
    inputs: [],
    outputs: [port('images', 'ImageRef', 'list')],
  },
  AudioBucket: {
    inputs: [],
    outputs: [port('audio', 'AudioRef', 'list')],
  },
  VideoBucket: {
    inputs: [],
    outputs: [port('videos', 'VideoRef', 'list')],
  },
  TextBucket: {
    inputs: [],
    outputs: [port('text', 'Text', 'list')],
  },
  TextGeneration: {
    inputs: [port('text', 'Text')],
    outputs: [port('generated_text', 'JSON')],
    defaultImplementation: 'fireworks:llama-v3p1',
  },
  ImageGeneration: {
    inputs: [
      port('prompt', 'Text'),
      port('image', 'ImageRef', 'single', false),
    ],
    outputs: [port('generated_image', 'ImageRef')],
  },
  ImageMatching: {
    inputs: [
      port('images', 'ImageRef', 'list'),
      port('text', 'Text'),
    ],
    outputs: [port('matches', 'JSON')],
  },
  Transcription: {
    inputs: [port('audio', 'AudioRef')],
    outputs: [port('transcription', 'Text')],
  },
  TextSummarization: {
    inputs: [port('text', 'Text')],
    outputs: [port('summary', 'Text')],
  },
  ImageExtraction: {
    inputs: [port('source', 'VideoRef')],
    outputs: [port('images', 'ImageRef', 'list')],
  },
}

export function getNodeSpec(nodeType: string): NodeTypeSpec | undefined {
  return NODE_REGISTRY[nodeType]
}
