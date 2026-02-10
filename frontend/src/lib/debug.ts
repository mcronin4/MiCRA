/**
 * Debug logging utilities that are disabled in production.
 * Use these instead of console.log for development-only logging.
 */

const isDev = process.env.NODE_ENV === 'development'

// Track execution start time for relative timestamps
let executionStartTime: number | null = null

function getTimestamp(): string {
  const now = Date.now()
  if (executionStartTime === null) {
    return '+0.000s'
  }
  const elapsed = (now - executionStartTime) / 1000
  return `+${elapsed.toFixed(3)}s`
}

function createDebugLogger(prefix: string) {
  if (isDev) {
    return (...args: unknown[]) => console.log(`[${prefix}] ${getTimestamp()}`, ...args)
  }
  return () => {}
}

export const debug = {
  /** SSE event logging */
  sse: createDebugLogger('SSE'),
  /** Workflow execution logging */
  workflow: createDebugLogger('Workflow'),
  /** Canvas/ReactFlow logging */
  canvas: createDebugLogger('Canvas'),
  /** General debug logging */
  log: createDebugLogger('Debug'),
  /** Start execution timer - call when workflow starts */
  startExecution: () => {
    executionStartTime = Date.now()
    if (isDev) {
      console.log('[Debug] Execution timer started')
    }
  },
  /** Reset execution timer */
  resetExecution: () => {
    executionStartTime = null
  },
}
