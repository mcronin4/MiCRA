'use client';

import Modal from '@/components/ui/Modal';
import type { WorkflowExecutionResult } from '@/types/workflow-execution';
import { CheckCircle, XCircle, Clock, Image, Music, Video, FileText, Sparkles, Type, Mic, Layers, Flag } from 'lucide-react';
import NextImage from 'next/image';

type ImageMatchingMatch = {
  image_url?: string
  similarity_score?: number
  caption?: string
  ocr_text?: string
  error?: string
}

interface ExecutionResultsModalProps {
  isOpen: boolean;
  onClose: () => void;
  result: WorkflowExecutionResult | null;
}

// Map node types to icons and labels
const NODE_TYPE_INFO: Record<string, { icon: React.ElementType; label: string; color: string }> = {
  ImageBucket: { icon: Image, label: 'Image Bucket', color: 'text-blue-600' },
  AudioBucket: { icon: Music, label: 'Audio Bucket', color: 'text-purple-600' },
  VideoBucket: { icon: Video, label: 'Video Bucket', color: 'text-red-600' },
  TextBucket: { icon: FileText, label: 'Text Bucket', color: 'text-green-600' },
  TextGeneration: { icon: Sparkles, label: 'Text Generation', color: 'text-amber-600' },
  ImageGeneration: { icon: Image, label: 'Image Generation', color: 'text-pink-600' },
  TextSummarization: { icon: Type, label: 'Summarization', color: 'text-cyan-600' },
  Transcription: { icon: Mic, label: 'Transcription', color: 'text-violet-600' },
  ImageMatching: { icon: Layers, label: 'Image Matching', color: 'text-orange-600' },
  ImageExtraction: { icon: Image, label: 'Image Extraction', color: 'text-indigo-600' },
  QuoteExtraction: { icon: FileText, label: 'Quote Extraction', color: 'text-teal-600' },
  End: { icon: Flag, label: 'End', color: 'text-slate-600' },
};

function getNodeTypeInfo(nodeType: string | null | undefined, nodeId: string) {
  // First try to use the node_type directly
  if (nodeType && NODE_TYPE_INFO[nodeType]) {
    return NODE_TYPE_INFO[nodeType];
  }
  // Fallback: try to extract type from node ID format (e.g., "ImageBucket-1")
  for (const [type, info] of Object.entries(NODE_TYPE_INFO)) {
    if (nodeId.includes(type)) {
      return info;
    }
  }
  return { icon: Layers, label: 'Node', color: 'text-gray-600' };
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

function formatOutputValue(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') {
    if (value.startsWith('http')) {
      // Truncate long URLs
      return value.length > 60 ? value.substring(0, 57) + '...' : value;
    }
    // Show full text for generated content (no truncation)
    return value;
  }
  if (Array.isArray(value)) {
    // For small arrays of simple values, show them inline
    if (value.length <= 3 && value.every(v => typeof v === 'string' && v.length < 50)) {
      return value.map(v => `"${v}"`).join(', ');
    }
    return `[${value.length} items]`;
  }
  if (typeof value === 'object') {
    return JSON.stringify(value, null, 2);
  }
  return String(value);
}

// Check if a value is a list of text items (strings)
function isTextList(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every(item => typeof item === 'string');
}

// Check if a value is a list of quote objects (with text field)
function isQuoteList(value: unknown): value is Array<{ text: string }> {
  return Array.isArray(value) && value.length > 0 && value.every(
    item => typeof item === 'object' && item !== null && 'text' in item && typeof (item as { text: unknown }).text === 'string'
  );
}

// Render a list of text items (like quotes) in a nice format
function TextListDisplay({ items, label }: { items: string[]; label: string }) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-gray-600 mb-2">
        {label} ({items.length} items):
      </div>
      <div className="space-y-2 max-h-80 overflow-y-auto">
        {items.map((item, idx) => (
          <div
            key={idx}
            className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm"
          >
            <div className="flex items-start gap-2">
              <span className="flex-shrink-0 w-6 h-6 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center text-xs font-semibold">
                {idx + 1}
              </span>
              <p className="text-sm text-gray-700 leading-relaxed flex-1">
                {item}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Render a list of quote objects in a nice format
function QuoteListDisplay({ quotes, label }: { quotes: Array<{ text: string }>; label: string }) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-gray-600 mb-2">
        {label} ({quotes.length} items):
      </div>
      <div className="space-y-2 max-h-80 overflow-y-auto">
        {quotes.map((quote, idx) => (
          <div
            key={idx}
            className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm"
          >
            <div className="flex items-start gap-2">
              <span className="flex-shrink-0 w-6 h-6 bg-teal-100 text-teal-700 rounded-full flex items-center justify-center text-xs font-semibold">
                {idx + 1}
              </span>
              <p className="text-sm text-gray-700 leading-relaxed flex-1 italic">
                &ldquo;{quote.text}&rdquo;
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ExecutionResultsModal({
  isOpen,
  onClose,
  result,
}: ExecutionResultsModalProps) {
  if (!isOpen) return null;

  // Show placeholder if no result yet
  if (!result) {
    return (
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="Workflow Execution Results"
      >
        <div className="space-y-4">
          <div className="text-sm text-gray-600">
            Execution completed but no result data available.
          </div>
          <div className="flex justify-end pt-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium text-gray-700 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  const successCount = result.node_results.filter(
    (nr) => nr.status === 'completed'
  ).length;
  const errorCount = result.node_results.filter(
    (nr) => nr.status === 'error'
  ).length;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Workflow Execution Results"
    >
      <div className="space-y-4">
        {/* Summary */}
        <div className="grid grid-cols-3 gap-3">
          <div className={`rounded-lg p-3 ${result.success ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50 border border-red-200'}`}>
            <div className="text-xs text-gray-500 mb-1">Status</div>
            <div className="flex items-center gap-2">
              {result.success ? (
                <>
                  <CheckCircle className="w-4 h-4 text-emerald-600" />
                  <span className="text-sm font-semibold text-emerald-700">
                    Success
                  </span>
                </>
              ) : (
                <>
                  <XCircle className="w-4 h-4 text-red-600" />
                  <span className="text-sm font-semibold text-red-700">
                    Failed
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <div className="text-xs text-gray-500 mb-1">Duration</div>
            <div className="flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-semibold text-gray-700">
                {formatDuration(result.total_execution_time_ms)}
              </span>
            </div>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <div className="text-xs text-gray-500 mb-1">Nodes</div>
            <div className="text-sm font-semibold">
              <span className="text-emerald-600">{successCount}</span>
              <span className="text-gray-400 mx-1">/</span>
              <span className={errorCount > 0 ? 'text-red-600' : 'text-gray-400'}>{errorCount}</span>
              <span className="text-gray-400 text-xs ml-1 font-normal">(ok/err)</span>
            </div>
          </div>
        </div>

        {/* Error message if failed */}
        {result.error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <div className="text-sm font-medium text-red-800 mb-1 flex items-center gap-2">
              <XCircle className="w-4 h-4" />
              Execution Error
            </div>
            <div className="text-xs text-red-700 font-mono bg-red-100/50 p-2 rounded">{result.error}</div>
          </div>
        )}

        {/* Workflow outputs */}
        {result.success && Object.keys(result.workflow_outputs).length > 0 && (
          <div>
            <div className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
              <Flag className="w-4 h-4 text-emerald-600" />
              Workflow Outputs
            </div>
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 max-h-96 overflow-auto">
              {Object.entries(result.workflow_outputs).map(([key, value]) => (
                <div key={key} className="mb-3 last:mb-0">
                  {isQuoteList(value) ? (
                    <QuoteListDisplay quotes={value} label={key} />
                  ) : isTextList(value) ? (
                    <TextListDisplay items={value} label={key} />
                  ) : (
                    <>
                      <div className="text-xs font-medium text-emerald-700 mb-1">{key}:</div>
                      <pre className="text-xs text-gray-600 whitespace-pre-wrap font-mono bg-white/50 p-2 rounded">
                        {formatOutputValue(value)}
                      </pre>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Node results */}
        <div>
          <div className="text-sm font-medium text-gray-700 mb-2">
            Node Execution Details
          </div>
          <div className="space-y-2 max-h-64 overflow-auto">
            {result.node_results.map((nr) => {
              const typeInfo = getNodeTypeInfo(nr.node_type, nr.node_id);
              const IconComponent = typeInfo.icon;

              return (
                <div
                  key={nr.node_id}
                  className={`border rounded-lg p-3 ${
                    nr.status === 'completed'
                      ? 'bg-white border-gray-200'
                      : 'bg-red-50 border-red-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <IconComponent className={`w-4 h-4 ${typeInfo.color}`} />
                      <span className="text-xs font-semibold text-gray-800">{typeInfo.label}</span>
                      <span className="text-xs text-gray-400 font-mono">{nr.node_id.split('-').pop()}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {nr.status === 'completed' ? (
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5 text-red-500" />
                      )}
                      <span className="text-xs text-gray-500 tabular-nums">
                        {formatDuration(nr.execution_time_ms)}
                      </span>
                    </div>
                  </div>
                  {nr.error && (
                    <div className="text-xs text-red-700 mt-2 font-mono bg-red-100/50 p-2 rounded">{nr.error}</div>
                  )}
                  {nr.outputs && Object.keys(nr.outputs).length > 0 && (
                    <div className="mt-2 pt-2 border-t border-gray-100">
                      {/* Special handling for Image Matching results */}
                      {nr.node_id.includes('ImageMatching') && nr.outputs.matches && Array.isArray(nr.outputs.matches) ? (
                        <div className="space-y-3">
                          <div className="text-xs font-medium text-gray-700 mb-2">
                            Matches ({nr.outputs.matches.length}):
                          </div>
                          <div className="grid grid-cols-2 gap-3 max-h-96 overflow-y-auto">
                            {(nr.outputs.matches as ImageMatchingMatch[]).map((match, idx) => (
                              <div
                                key={idx}
                                className="border border-gray-200 rounded-lg overflow-hidden bg-white"
                              >
                                {/* Image */}
                                <div className="relative aspect-square bg-gray-100">
                                  {match.image_url ? (
                                    <NextImage
                                      src={match.image_url}
                                      alt={`Match ${idx + 1}`}
                                      fill
                                      className="object-cover"
                                      unoptimized
                                    />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">
                                      No image
                                    </div>
                                  )}
                                  {/* Similarity score badge */}
                                  {match.similarity_score !== undefined && (
                                    <div className="absolute top-2 right-2 bg-black/70 text-white text-xs font-semibold px-2 py-1 rounded">
                                      {Math.round(match.similarity_score * 100)}%
                                    </div>
                                  )}
                                </div>
                                {/* Text content */}
                                <div className="p-2 space-y-1.5">
                                  {match.caption && (
                                    <div className="text-xs">
                                      <span className="text-gray-500 font-medium">Caption:</span>
                                      <p className="text-gray-700 mt-0.5 line-clamp-2">{match.caption}</p>
                                    </div>
                                  )}
                                  {match.ocr_text && (
                                    <div className="text-xs">
                                      <span className="text-gray-500 font-medium">OCR:</span>
                                      <p className="text-gray-600 mt-0.5 line-clamp-2 font-mono text-[10px]">{match.ocr_text}</p>
                                    </div>
                                  )}
                                  {match.error && (
                                    <div className="text-xs text-red-600 bg-red-50 p-1 rounded">
                                      Error: {match.error}
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        /* Default output display for other node types */
                        Object.entries(nr.outputs).map(([key, value]) => (
                          <div key={key} className="text-xs">
                            {isQuoteList(value) ? (
                              <QuoteListDisplay quotes={value} label={key} />
                            ) : isTextList(value) ? (
                              <TextListDisplay items={value} label={key} />
                            ) : (
                              <>
                                <span className="text-gray-500">{key}:</span>{' '}
                                <span className="text-gray-700 font-mono">{formatOutputValue(value)}</span>
                              </>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end pt-2 border-t border-gray-100">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium text-gray-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
