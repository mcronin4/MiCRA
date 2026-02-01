/**
 * Hook for compiling a workflow editor graph into a Blueprint.
 * Calls the backend compile endpoint and returns the blueprint or errors.
 */

import { useState, useCallback } from 'react'
import type { CompilationResult, CompilationDiagnostic } from '@/types/blueprint'
import { compileWorkflow, compileWorkflowById } from '@/lib/fastapi/workflows'
import type { SavedWorkflowData } from '@/lib/fastapi/workflows'

export function useBlueprintCompile() {
  const [isCompiling, setIsCompiling] = useState(false)
  const [result, setResult] = useState<CompilationResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  /**
   * Compile a raw (unsaved) editor graph.
   */
  const compileRaw = useCallback(async (workflowData: SavedWorkflowData) => {
    setIsCompiling(true)
    setError(null)
    setResult(null)

    try {
      const compilationResult = await compileWorkflow(workflowData)
      setResult(compilationResult)
      return compilationResult
    } catch (err: unknown) {
      // Try to extract diagnostics from error response
      let diagnostics: CompilationDiagnostic[] = []
      let errorMessage = 'Compilation failed'
      
      if (err instanceof Error) {
        errorMessage = err.message
        // Try to parse error detail if it contains diagnostics
        // The API client may return the detail object as a string or we need to parse it
        try {
          // First try parsing as JSON string
          const parsed = JSON.parse(err.message)
          if (parsed.diagnostics && Array.isArray(parsed.diagnostics)) {
            diagnostics = parsed.diagnostics as CompilationDiagnostic[]
          } else if (parsed.message) {
            errorMessage = parsed.message
            if (parsed.diagnostics) {
              diagnostics = parsed.diagnostics as CompilationDiagnostic[]
            }
          }
        } catch {
          // If parsing fails, check if message looks like an object string representation
          // Sometimes objects are stringified as "[object Object]"
          if (err.message.includes('diagnostics')) {
            // Try to extract from a structured error
            try {
              // Check if there's a detail property we can access
              const errorObj = err as { detail?: { diagnostics?: CompilationDiagnostic[] } }
              if (errorObj.detail?.diagnostics) {
                diagnostics = errorObj.detail.diagnostics
              }
            } catch {
              // Ignore
            }
          }
        }
      }
      
      // Create a failed compilation result with diagnostics
      const failedResult: CompilationResult = {
        success: false,
        blueprint: null,
        diagnostics,
      }
      setResult(failedResult)
      setError(errorMessage)
      return failedResult
    } finally {
      setIsCompiling(false)
    }
  }, [])

  /**
   * Compile a saved workflow by its ID (uses latest version).
   */
  const compileById = useCallback(async (workflowId: string) => {
    setIsCompiling(true)
    setError(null)
    setResult(null)

    try {
      const compilationResult = await compileWorkflowById(workflowId)
      setResult(compilationResult)
      return compilationResult
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Compilation failed'
      setError(errorMessage)
      return null
    } finally {
      setIsCompiling(false)
    }
  }, [])

  const diagnostics: CompilationDiagnostic[] = result?.diagnostics ?? []
  const errors = diagnostics.filter((d) => d.level === 'error')
  const warnings = diagnostics.filter((d) => d.level === 'warning')

  return {
    isCompiling,
    result,
    error,
    diagnostics,
    errors,
    warnings,
    compileRaw,
    compileById,
  }
}
