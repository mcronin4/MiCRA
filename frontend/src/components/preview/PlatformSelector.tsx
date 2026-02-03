'use client'

import { Linkedin, Instagram, Twitter } from 'lucide-react'

interface PlatformOption {
  id: string
  label: string
  icon: React.ElementType
  enabled: boolean
}

const PLATFORMS: PlatformOption[] = [
  { id: 'linkedin', label: 'LinkedIn', icon: Linkedin, enabled: true },
  { id: 'instagram', label: 'Instagram', icon: Instagram, enabled: false },
  { id: 'x', label: 'X', icon: Twitter, enabled: false },
]

interface PlatformSelectorProps {
  activePlatform: string
  onSelect: (platformId: string) => void
}

export function PlatformSelector({
  activePlatform,
  onSelect,
}: PlatformSelectorProps) {
  return (
    <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
      {PLATFORMS.map((platform) => {
        const Icon = platform.icon
        const isActive = activePlatform === platform.id

        return (
          <button
            key={platform.id}
            onClick={() => platform.enabled && onSelect(platform.id)}
            disabled={!platform.enabled}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              isActive
                ? 'bg-white text-slate-800 shadow-sm'
                : platform.enabled
                  ? 'text-slate-500 hover:text-slate-700'
                  : 'text-slate-300 cursor-not-allowed'
            }`}
            title={!platform.enabled ? 'Coming soon' : undefined}
          >
            <Icon size={14} />
            {platform.label}
            {!platform.enabled && (
              <span className="text-[10px] text-slate-400">Soon</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
