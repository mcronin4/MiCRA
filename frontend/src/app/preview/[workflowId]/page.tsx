'use client'

import { use } from 'react'
import { PreviewPage } from '@/components/preview/PreviewPage'

export default function PreviewRoute({
  params,
}: {
  params: Promise<{ workflowId: string }>
}) {
  const { workflowId } = use(params)
  return <PreviewPage workflowId={workflowId} />
}
