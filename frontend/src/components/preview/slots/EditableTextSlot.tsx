'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { valueToString } from './TextSlot'

interface EditableTextSlotProps {
  value: unknown
  onChange: (value: string) => void
  /** Max characters (e.g. LinkedIn 3000, X 280). Omit = no limit. */
  maxChars?: number
}

export function EditableTextSlot({
  value,
  onChange,
  maxChars,
}: EditableTextSlotProps) {
  const text = typeof value === 'string' ? value : valueToString(value)
  const [localValue, setLocalValue] = useState(text)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const str = typeof value === 'string' ? value : valueToString(value)
    const truncated =
      maxChars != null && str.length > maxChars ? str.slice(0, maxChars) : str
    setLocalValue(truncated)
  }, [value, maxChars])

  // Auto-grow textarea to fit content (handles long single-line text, not just line count)
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.max(el.scrollHeight, 40)}px`
  }, [localValue])

  const handleBlur = useCallback(() => {
    if (localValue !== text) {
      onChange(localValue)
    }
  }, [localValue, text, onChange])

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setLocalValue(e.target.value)
    },
    []
  )

  const len = localValue.length

  const classes =
    'text-sm text-slate-700 leading-relaxed resize-none overflow-hidden border-0 bg-transparent w-full focus:outline-none focus:ring-0 p-0 min-h-[2.5rem] block'

  return (
    <div className="w-full">
      <textarea
        ref={textareaRef}
        value={localValue}
        onChange={handleChange}
        onBlur={handleBlur}
        className={classes}
        rows={2}
        maxLength={maxChars}
      />
      {maxChars != null && (
        <div
          className={`mt-1 text-[10px] tabular-nums ${
            len >= maxChars ? 'text-amber-600 font-medium' : 'text-slate-400'
          }`}
        >
          {len.toLocaleString()} / {maxChars.toLocaleString()}
        </div>
      )}
    </div>
  )
}
