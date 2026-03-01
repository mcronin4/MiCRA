import { useCallback, useState } from 'react'
import type {
  CopilotPlanMode,
  CopilotPlanResponse,
  SavedWorkflowData,
} from '@/lib/fastapi/workflows'
import { planWorkflowWithCopilot } from '@/lib/fastapi/workflows'

interface RequestPlanArgs {
  message: string
  mode: CopilotPlanMode
  workflowData: SavedWorkflowData
  preferences?: Record<string, unknown>
}

export function useWorkflowCopilot() {
  const [prompt, setPrompt] = useState('')
  const [mode, setMode] = useState<CopilotPlanMode>('edit')
  const [isPlanning, setIsPlanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingPlan, setPendingPlan] = useState<CopilotPlanResponse | null>(null)

  const clearPlan = useCallback(() => {
    setPendingPlan(null)
    setError(null)
  }, [])

  const requestPlan = useCallback(async ({
    message,
    mode,
    workflowData,
    preferences,
  }: RequestPlanArgs) => {
    setIsPlanning(true)
    setError(null)
    try {
      const response = await planWorkflowWithCopilot({
        message,
        mode,
        workflow_data: workflowData,
        preferences,
      })
      setPendingPlan(response)
      return response
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to generate MicrAI plan.'
      setError(message)
      throw err
    } finally {
      setIsPlanning(false)
    }
  }, [])

  return {
    prompt,
    setPrompt,
    mode,
    setMode,
    isPlanning,
    error,
    pendingPlan,
    setPendingPlan,
    clearPlan,
    requestPlan,
  }
}

