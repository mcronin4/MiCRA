import type { SavedWorkflowData } from '@/lib/fastapi/workflows'
import { layoutWorkflowData } from '../workflowLayout'
import { DEFAULT_WORKFLOW_NODE_COLUMN_GAP } from '../workflowNodeSizing'

function makeWorkflowData(): SavedWorkflowData {
  return {
    nodes: [
      { id: 'source', type: 'transcription', position: { x: 0, y: 0 } },
      { id: 'target', type: 'text-generation', position: { x: 0, y: 0 } },
    ],
    edges: [
      {
        id: 'source-target',
        source: 'source',
        target: 'target',
      },
    ],
  }
}

describe('layoutWorkflowData', () => {
  it('uses the shared node width gap between successive layers', () => {
    const laidOut = layoutWorkflowData(makeWorkflowData(), { mode: 'full' })
    const source = laidOut.nodes.find((node) => node.id === 'source')
    const target = laidOut.nodes.find((node) => node.id === 'target')

    expect(source).toBeDefined()
    expect(target).toBeDefined()
    expect(target!.position.x - source!.position.x).toBe(
      DEFAULT_WORKFLOW_NODE_COLUMN_GAP
    )
  })

  it('shifts touched nodes away from nearby fixed nodes', () => {
    const laidOut = layoutWorkflowData(
      {
        nodes: [
          { id: 'source', type: 'transcription', position: { x: 100, y: 100 } },
          { id: 'target', type: 'text-generation', position: { x: 100, y: 100 } },
          {
            id: 'fixed-output',
            type: 'output',
            position: { x: 160 + DEFAULT_WORKFLOW_NODE_COLUMN_GAP, y: 120 },
          },
        ],
        edges: [
          {
            id: 'source-target',
            source: 'source',
            target: 'target',
          },
        ],
      },
      {
        mode: 'touched',
        touchedNodeIds: ['source', 'target'],
      }
    )

    const target = laidOut.nodes.find((node) => node.id === 'target')

    expect(target).toBeDefined()
    expect(target!.position.x).toBe(160 + DEFAULT_WORKFLOW_NODE_COLUMN_GAP)
    expect(target!.position.y).toBeGreaterThan(120)
  })
})
