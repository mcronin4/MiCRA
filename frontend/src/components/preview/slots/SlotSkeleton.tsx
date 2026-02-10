'use client'

import type { TemplateSlot } from '@/types/preview'

interface SlotSkeletonProps {
  slot: TemplateSlot
}

export function SlotSkeleton({ slot }: SlotSkeletonProps) {
  const isMedia =
    slot.acceptsTypes.includes('image') || slot.acceptsTypes.includes('video')

  if (isMedia) {
    return (
      <div className="w-full rounded-lg overflow-hidden">
        <div className="skeleton-shimmer w-full h-52 rounded-lg" />
      </div>
    )
  }

  return (
    <div className="space-y-1.5 py-1">
      <div className="skeleton-shimmer h-3.5 rounded w-full" />
      <div
        className="skeleton-shimmer h-3.5 rounded w-[92%]"
        style={{ animationDelay: '100ms' }}
      />
      <div
        className="skeleton-shimmer h-3.5 rounded w-[78%]"
        style={{ animationDelay: '200ms' }}
      />
      <div
        className="skeleton-shimmer h-3.5 rounded w-[60%]"
        style={{ animationDelay: '300ms' }}
      />
    </div>
  )
}
