import type { ExecutionLogDetail } from '../workflow-execution'

describe('ExecutionLogDetail type safety', () => {
  describe('node_summaries with node_type', () => {
    it('should accept node_type in node_summaries', () => {
      const detail: ExecutionLogDetail = {
        id: 'exec-1',
        workflow_id: 'workflow-1',
        success: true,
        error: null,
        total_execution_time_ms: 100,
        node_count: 1,
        nodes_completed: 1,
        nodes_errored: 0,
        created_at: '2024-01-01T00:00:00Z',
        node_summaries: [
          {
            node_id: 'node-1',
            node_type: 'TextGeneration',
            status: 'completed',
            error: null,
            execution_time_ms: 50,
          },
        ],
      }

      expect(detail.node_summaries[0].node_type).toBe('TextGeneration')
    })

    it('should handle node_type as null', () => {
      const detail: ExecutionLogDetail = {
        id: 'exec-1',
        workflow_id: 'workflow-1',
        success: true,
        error: null,
        total_execution_time_ms: 100,
        node_count: 1,
        nodes_completed: 1,
        nodes_errored: 0,
        created_at: '2024-01-01T00:00:00Z',
        node_summaries: [
          {
            node_id: 'node-1',
            node_type: null,
            status: 'completed',
            error: null,
            execution_time_ms: 50,
          },
        ],
      }

      expect(detail.node_summaries[0].node_type).toBeNull()
    })

    it('should handle missing node_type (legacy data)', () => {
      const detail: ExecutionLogDetail = {
        id: 'exec-1',
        workflow_id: 'workflow-1',
        success: true,
        error: null,
        total_execution_time_ms: 100,
        node_count: 1,
        nodes_completed: 1,
        nodes_errored: 0,
        created_at: '2024-01-01T00:00:00Z',
        node_summaries: [
          {
            node_id: 'node-1',
            // node_type missing (legacy data)
            status: 'completed',
            error: null,
            execution_time_ms: 50,
          },
        ],
      }

      // TypeScript should allow this, and runtime should handle undefined
      expect(detail.node_summaries[0].node_type).toBeUndefined()
    })

    it('should handle multiple nodes with mixed node_type presence', () => {
      const detail: ExecutionLogDetail = {
        id: 'exec-1',
        workflow_id: 'workflow-1',
        success: true,
        error: null,
        total_execution_time_ms: 200,
        node_count: 3,
        nodes_completed: 2,
        nodes_errored: 1,
        created_at: '2024-01-01T00:00:00Z',
        node_summaries: [
          {
            node_id: 'node-1',
            node_type: 'TextGeneration',
            status: 'completed',
            error: null,
            execution_time_ms: 50,
          },
          {
            node_id: 'node-2',
            // node_type missing (legacy)
            status: 'completed',
            error: null,
            execution_time_ms: 75,
          },
          {
            node_id: 'node-3',
            node_type: null,
            status: 'error',
            error: 'Execution failed',
            execution_time_ms: 100,
          },
        ],
      }

      expect(detail.node_summaries[0].node_type).toBe('TextGeneration')
      expect(detail.node_summaries[1].node_type).toBeUndefined()
      expect(detail.node_summaries[2].node_type).toBeNull()
    })
  })
})
