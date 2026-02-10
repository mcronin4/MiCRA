import { buildPersistedNodes } from '@/lib/preview-utils'
import type { WorkflowRunOutputs } from '@/lib/fastapi/workflows'
import type { PreviewNodeState } from '../PreviewDataContext'

describe('buildPersistedNodes', () => {
  const createMockRunOutputs = (
    overrides?: Partial<WorkflowRunOutputs>
  ): WorkflowRunOutputs => ({
    execution_id: 'exec-1',
    workflow_id: 'workflow-1',
    node_outputs: {
      'node-1': { output: 'value1' },
      'node-2': { output: 'value2' },
    },
    workflow_outputs: {},
    blueprint_snapshot: {
      nodes: [
        { node_id: 'node-1', type: 'TextGeneration' },
        { node_id: 'node-2', type: 'ImageBucket' },
      ],
    },
    payload_bytes: 100,
    created_at: '2024-01-01T00:00:00Z',
    ...overrides,
  })

  describe('blueprint_snapshot validation', () => {
    it('should build nodes from valid blueprint_snapshot', () => {
      const runOutputs = createMockRunOutputs()
      const result = buildPersistedNodes(runOutputs)

      expect(result).toHaveProperty('node-1')
      expect(result).toHaveProperty('node-2')
      expect(result['node-1']).toEqual({
        id: 'node-1',
        type: 'TextGeneration',
        status: 'completed',
        outputs: { output: 'value1' },
      })
      expect(result['node-2']).toEqual({
        id: 'node-2',
        type: 'ImageBucket',
        status: 'completed',
        outputs: { output: 'value2' },
      })
    })

    it('should handle null blueprint_snapshot', () => {
      const runOutputs = createMockRunOutputs({
        blueprint_snapshot: null,
      })
      const result = buildPersistedNodes(runOutputs)

      expect(result).toHaveProperty('node-1')
      expect(result).toHaveProperty('node-2')
      expect(result['node-1'].type).toBe('Unknown')
      expect(result['node-2'].type).toBe('Unknown')
    })

    it('should handle blueprint_snapshot with null nodes', () => {
      const runOutputs = createMockRunOutputs({
        blueprint_snapshot: { nodes: null },
      })
      const result = buildPersistedNodes(runOutputs)

      expect(result).toHaveProperty('node-1')
      expect(result['node-1'].type).toBe('Unknown')
    })

    it('should handle blueprint_snapshot with missing nodes field', () => {
      const runOutputs = createMockRunOutputs({
        blueprint_snapshot: {} as { nodes?: unknown },
      })
      const result = buildPersistedNodes(runOutputs)

      expect(result).toHaveProperty('node-1')
      expect(result['node-1'].type).toBe('Unknown')
    })

    it('should handle blueprint_snapshot with empty nodes array', () => {
      const runOutputs = createMockRunOutputs({
        blueprint_snapshot: { nodes: [] },
      })
      const result = buildPersistedNodes(runOutputs)

      expect(result).toHaveProperty('node-1')
      expect(result['node-1'].type).toBe('Unknown')
    })

    it('should handle nodes array with invalid items', () => {
      const runOutputs = createMockRunOutputs({
        blueprint_snapshot: {
          nodes: [
            null,
            'invalid',
            { node_id: 'node-1', type: 'TextGeneration' },
            { node_id: null, type: 'TextGeneration' },
            { node_id: 'node-2' }, // missing type
          ] as Array<unknown>,
        },
      })
      const result = buildPersistedNodes(runOutputs)

      // Should only map valid nodes
      expect(result['node-1'].type).toBe('TextGeneration')
      expect(result['node-2'].type).toBe('Unknown') // node-2 missing type
    })

    it('should handle nodes with null node_id or type', () => {
      const runOutputs = createMockRunOutputs({
        node_outputs: {
          'node-1': { output: 'value1' },
          'node-2': { output: 'value2' },
          'node-3': { output: 'value3' },
        },
        blueprint_snapshot: {
          nodes: [
            { node_id: null, type: 'TextGeneration' },
            { node_id: 'node-2', type: null },
            { node_id: 'node-3', type: 'ImageBucket' },
          ],
        },
      })
      const result = buildPersistedNodes(runOutputs)

      // Only node-3 should be mapped (has both node_id and type)
      expect(result['node-3']?.type).toBe('ImageBucket')
      // node-1 and node-2 should still exist but with Unknown type
      expect(result['node-1']?.type).toBe('Unknown')
      expect(result['node-2']?.type).toBe('Unknown')
    })

    it('should handle non-array nodes value', () => {
      const runOutputs = createMockRunOutputs({
        blueprint_snapshot: {
          nodes: 'not-an-array' as unknown as Array<{ node_id?: string | null; type?: string | null }>,
        },
      })
      const result = buildPersistedNodes(runOutputs)

      // Should not crash, nodes should have Unknown type
      expect(result['node-1'].type).toBe('Unknown')
    })

    it('should handle missing node_outputs', () => {
      const runOutputs = createMockRunOutputs({
        node_outputs: undefined as unknown as Record<string, Record<string, unknown>>,
      })
      const result = buildPersistedNodes(runOutputs)

      expect(result).toEqual({})
    })

    it('should handle empty node_outputs', () => {
      const runOutputs = createMockRunOutputs({
        node_outputs: {},
      })
      const result = buildPersistedNodes(runOutputs)

      expect(result).toEqual({})
    })
  })

  describe('node type mapping', () => {
    it('should map node types correctly from blueprint_snapshot', () => {
      const runOutputs = createMockRunOutputs({
        blueprint_snapshot: {
          nodes: [
            { node_id: 'node-1', type: 'TextGeneration' },
            { node_id: 'node-2', type: 'ImageBucket' },
            { node_id: 'node-3', type: 'Transcription' },
          ],
        },
        node_outputs: {
          'node-1': { text: 'output1' },
          'node-2': { images: [] },
          'node-3': { transcript: 'output3' },
        },
      })
      const result = buildPersistedNodes(runOutputs)

      expect(result['node-1'].type).toBe('TextGeneration')
      expect(result['node-2'].type).toBe('ImageBucket')
      expect(result['node-3'].type).toBe('Transcription')
    })

    it('should use Unknown for nodes not in blueprint_snapshot', () => {
      const runOutputs = createMockRunOutputs({
        blueprint_snapshot: {
          nodes: [
            { node_id: 'node-1', type: 'TextGeneration' },
            // node-2 missing from blueprint_snapshot
          ],
        },
        node_outputs: {
          'node-1': { output: 'value1' },
          'node-2': { output: 'value2' },
        },
      })
      const result = buildPersistedNodes(runOutputs)

      expect(result['node-1'].type).toBe('TextGeneration')
      expect(result['node-2'].type).toBe('Unknown')
    })
  })

  describe('output structure', () => {
    it('should preserve output structure', () => {
      const complexOutputs = {
        'node-1': {
          text: 'Hello',
          metadata: { count: 5 },
          items: [1, 2, 3],
        },
      }
      const runOutputs = createMockRunOutputs({
        node_outputs: complexOutputs,
        blueprint_snapshot: {
          nodes: [{ node_id: 'node-1', type: 'TextGeneration' }],
        },
      })
      const result = buildPersistedNodes(runOutputs)

      expect(result['node-1'].outputs).toEqual(complexOutputs['node-1'])
    })

    it('should set status to completed for all nodes', () => {
      const runOutputs = createMockRunOutputs()
      const result = buildPersistedNodes(runOutputs)

      Object.values(result).forEach((node: PreviewNodeState) => {
        expect(node.status).toBe('completed')
      })
    })
  })
})
