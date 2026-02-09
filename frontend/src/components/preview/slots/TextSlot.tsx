'use client'

interface QuoteObject {
  text: string
  reason?: string
  source?: string
}

interface TextSlotProps {
  value: unknown
  variant?: 'headline' | 'body' | 'caption'
}

function stripCodeFence(raw: string): string {
  const trimmed = raw.trim()
  const match = trimmed.match(/^```(?:json|text)?\s*([\s\S]*?)\s*```$/i)
  return match ? match[1] : raw
}

function tryParseJson(raw: string): unknown | null {
  const candidate = stripCodeFence(raw).trim()
  if (!candidate) return null
  if (!candidate.startsWith('{') && !candidate.startsWith('[')) return null
  try {
    return JSON.parse(candidate)
  } catch {
    return null
  }
}

function extractPrimaryTextFromObject(
  obj: Record<string, unknown>
): string | null {
  const preferredKeys = [
    'content',
    'text',
    'generated_text',
    'transcription',
    'caption',
    'body',
    'message',
  ] as const

  for (const key of preferredKeys) {
    const val = obj[key]
    if (typeof val === 'string' && val.trim()) return val
  }

  return null
}

/** Replace literal \n sequences with real newlines and clean up escaped quotes */
function normalizeText(raw: string): string {
  return raw
    .replace(/\\n/g, '\n')
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
}

function isQuoteObject(item: unknown): item is QuoteObject {
  if (!item || typeof item !== 'object') return false
  const obj = item as Record<string, unknown>
  return typeof obj.text === 'string' && ('reason' in obj || 'source' in obj)
}

/** Extract readable text from an unknown value */
function valueToString(value: unknown): string {
  if (typeof value === 'string') {
    const parsed = tryParseJson(value)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const extracted = extractPrimaryTextFromObject(parsed as Record<string, unknown>)
      if (extracted) return extracted
      return JSON.stringify(parsed, null, 2)
    }
    return value
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>
    const extracted = extractPrimaryTextFromObject(obj)
    if (extracted) return extracted
    // ImageMatching: extract caption or describe the match
    if ('caption' in obj && typeof obj.caption === 'string') return obj.caption
    if ('image_url' in obj) {
      const score = obj.similarity_score ?? obj.similarity ?? 0
      return `Image match (${Math.round(Number(score) * 100)}%)`
    }
    if (isQuoteObject(value)) return value.text
    return JSON.stringify(value, null, 2)
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') return item
        if (isQuoteObject(item)) return item.text
        if (item && typeof item === 'object' && 'caption' in item) {
          return String((item as Record<string, unknown>).caption)
        }
        return JSON.stringify(item, null, 2)
      })
      .join('\n\n')
  }

  return String(value ?? '')
}

function QuoteBlock({ quote }: { quote: QuoteObject }) {
  const attribution = [quote.source, quote.reason].filter(Boolean).join(' — ')
  return (
    <blockquote className="border-l-2 border-indigo-300 pl-3 py-1">
      <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
        {normalizeText(quote.text)}
      </p>
      {attribution && (
        <p className="text-xs text-slate-400 mt-1 italic">{attribution}</p>
      )}
    </blockquote>
  )
}

export function TextSlot({ value, variant = 'body' }: TextSlotProps) {
  const styles = {
    headline: 'text-base font-semibold text-slate-900 leading-snug whitespace-pre-wrap',
    body: 'text-sm text-slate-700 leading-relaxed whitespace-pre-wrap',
    caption: 'text-xs text-slate-500 italic whitespace-pre-wrap',
  }

  // Single quote object
  if (isQuoteObject(value)) {
    return <QuoteBlock quote={value} />
  }

  // Array that contains quote objects → render as blockquotes
  if (Array.isArray(value) && value.some(isQuoteObject)) {
    return (
      <div className="space-y-3">
        {value.map((item, i) =>
          isQuoteObject(item) ? (
            <QuoteBlock key={i} quote={item} />
          ) : (
            <div key={i} className={styles[variant]}>
              {normalizeText(typeof item === 'string' ? item : String(item))}
            </div>
          )
        )}
      </div>
    )
  }

  // Default: convert to string and render
  const text = typeof value === 'string' ? value : valueToString(value)
  return <div className={styles[variant]}>{normalizeText(text)}</div>
}
