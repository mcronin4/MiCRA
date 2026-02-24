'use client'

import { Twitter } from 'lucide-react'
import { X_TEMPLATE } from '@/types/preview'
import { PlatformMockupBase } from './PlatformMockupBase'

export interface XMockupProps {
  headerActions?: React.ReactNode
  footerContent?: React.ReactNode
}

export function XMockup({ headerActions, footerContent }: XMockupProps) {
  return (
    <PlatformMockupBase
      template={X_TEMPLATE}
      headerContent={
        <>
          <div className="w-8 h-8 rounded-full bg-black flex items-center shrink-0 justify-center">
            <Twitter size={15} className="text-white" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-800">
              X Post Preview
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
