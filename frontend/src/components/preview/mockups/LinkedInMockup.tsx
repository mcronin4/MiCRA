'use client'

import { Linkedin } from 'lucide-react'
import { LINKEDIN_TEMPLATE } from '@/types/preview'
import { PlatformMockupBase } from './PlatformMockupBase'

export interface LinkedInMockupProps {
  headerActions?: React.ReactNode
  footerContent?: React.ReactNode
}

export function LinkedInMockup({ headerActions, footerContent }: LinkedInMockupProps) {
  return (
    <PlatformMockupBase
      template={LINKEDIN_TEMPLATE}
      headerContent={
        <>
          <div className="w-8 h-8 rounded-full bg-[#0a66c2] flex items-center shrink-0 justify-center">
            <Linkedin size={16} className="text-white" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-800">
              LinkedIn Post Preview
            </div>
            <div className="text-[11px] text-slate-400">Draft</div>
          </div>
        </>
      }
      headerActions={headerActions}
      footerContent={footerContent}
    />
  )
}
