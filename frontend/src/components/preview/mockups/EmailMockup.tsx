'use client'

import { Mail } from 'lucide-react'
import { EMAIL_TEMPLATE } from '@/types/preview'
import { PlatformMockupBase } from './PlatformMockupBase'

export interface EmailMockupProps {
  headerActions?: React.ReactNode
  footerContent?: React.ReactNode
}

export function EmailMockup({ headerActions, footerContent }: EmailMockupProps) {
  return (
    <PlatformMockupBase
      template={EMAIL_TEMPLATE}
      headerContent={
        <>
          <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center shrink-0 justify-center">
            <Mail size={15} className="text-white" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-800">
              Email Draft Preview
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
