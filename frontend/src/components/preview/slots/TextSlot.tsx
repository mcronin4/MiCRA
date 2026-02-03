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
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') return item
        if (isQuoteObject(item)) return item.text
        return JSON.stringify(item, null, 2)
      })
      .join('\n\n')
  }
  if (isQuoteObject(value)) return value.text
  if (value && typeof value === 'object') return JSON.stringify(value, null, 2)
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
