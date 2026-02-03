'use client'

interface TextSlotProps {
  value: string
  variant?: 'headline' | 'body' | 'caption'
}

/** Replace literal \n sequences with real newlines and clean up escaped quotes */
function normalizeText(raw: string): string {
  return raw
    .replace(/\\n/g, '\n')
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
}

export function TextSlot({ value, variant = 'body' }: TextSlotProps) {
  const styles = {
    headline: 'text-base font-semibold text-slate-900 leading-snug whitespace-pre-wrap',
    body: 'text-sm text-slate-700 leading-relaxed whitespace-pre-wrap',
    caption: 'text-xs text-slate-500 italic whitespace-pre-wrap',
  }

  return <div className={styles[variant]}>{normalizeText(value)}</div>
}
