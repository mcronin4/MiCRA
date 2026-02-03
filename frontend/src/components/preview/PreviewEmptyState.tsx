'use client'

import Link from 'next/link'
import { PlayCircle } from 'lucide-react'

export function PreviewEmptyState() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center max-w-md px-6">
        <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-6">
          <PlayCircle className="w-8 h-8 text-slate-400" />
        </div>
        <h2 className="text-lg font-semibold text-slate-800 mb-2">
          No outputs yet
        </h2>
        <p className="text-sm text-slate-500 mb-6">
          Run your workflow to generate outputs, then come back here to compose
          your post.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          Go to editor
        </Link>
      </div>
    </div>
  )
}
