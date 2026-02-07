'use client'

import { ImagePreview } from './ImagePreview'
import { TextPreview } from './TextPreview'

interface JsonPreviewProps {
  value: unknown
  nodeType: string
}

export function JsonPreview({ value, nodeType }: JsonPreviewProps) {
  // ImageMatching: {image_url, similarity_score, caption, ocr_text}
  if (nodeType === 'ImageMatching' && value && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const score = (obj.similarity_score ?? obj.similarity ?? 0) as number

    return (
      <div className="flex items-center gap-2">
        <ImagePreview value={obj.image_url} size="thumbnail" />
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium text-slate-700">
            {Math.round(score * 100)}% match
          </div>
          {typeof obj.caption === 'string' && (
            <p className="text-[10px] text-slate-500 truncate">
              {obj.caption}
            </p>
          )}
        </div>
      </div>
    )
  }

  // QuoteExtraction: {text, reason, source}
  if (
    nodeType === 'QuoteExtraction' &&
    value &&
    typeof value === 'object' &&
    'text' in value
  ) {
    return <TextPreview value={value} maxLength={80} />
  }

  // Fallback: truncated JSON string
  return (
    <p className="text-xs text-slate-500 font-mono truncate">
      {JSON.stringify(value).slice(0, 60)}
    </p>
  )
}
