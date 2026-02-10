'use client'

export default function PreviewLoading() {
  return (
    <div className="h-screen flex flex-col bg-white">
      {/* Header skeleton */}
      <div className="h-12 bg-white border-b border-slate-100 flex items-center px-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="h-4 w-16 bg-slate-200 rounded animate-pulse" />
          <div className="h-4 w-4 bg-slate-200 rounded animate-pulse" />
          <div className="h-4 w-32 bg-slate-200 rounded animate-pulse" />
        </div>
      </div>

      {/* Main content skeleton */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar skeleton */}
        <div className="w-64 border-r border-slate-100 p-4 space-y-3">
          <div className="h-4 w-20 bg-slate-200 rounded animate-pulse" />
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex gap-2">
              <div className="h-10 w-10 bg-slate-200 rounded-lg animate-pulse shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-full bg-slate-200 rounded animate-pulse" />
                <div className="h-3 w-3/4 bg-slate-200 rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>

        {/* Main area skeleton */}
        <div className="flex-1 flex flex-col">
          <div className="h-12 border-b border-slate-200 bg-slate-50/50 px-6 flex items-center gap-4">
            <div className="h-8 w-24 bg-slate-200 rounded-lg animate-pulse" />
            <div className="h-8 w-20 bg-slate-200 rounded animate-pulse" />
            <div className="h-8 w-16 bg-slate-200 rounded animate-pulse" />
          </div>
          <div className="flex-1 p-8 bg-slate-50/30">
            {/* LinkedIn mockup skeleton */}
            <div className="max-w-lg mx-auto bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex gap-3">
                <div className="h-12 w-12 rounded-full bg-slate-200 animate-pulse shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-32 bg-slate-200 rounded animate-pulse" />
                  <div className="h-3 w-48 bg-slate-200 rounded animate-pulse" />
                </div>
              </div>
              <div className="p-4 space-y-3">
                <div className="h-4 w-full bg-slate-200 rounded animate-pulse" />
                <div className="h-4 w-full bg-slate-200 rounded animate-pulse" />
                <div className="h-4 w-2/3 bg-slate-200 rounded animate-pulse" />
              </div>
              <div className="p-4 border-t border-slate-100 flex gap-2">
                <div className="h-8 w-16 bg-slate-200 rounded animate-pulse" />
                <div className="h-8 w-16 bg-slate-200 rounded animate-pulse" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
