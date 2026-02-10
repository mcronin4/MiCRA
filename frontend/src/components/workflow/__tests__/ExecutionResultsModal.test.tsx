import { render, screen } from '@testing-library/react'
import { ExecutionResultsModal } from '../ExecutionResultsModal'
import type { WorkflowExecutionResult } from '@/types/workflow-execution'

// Mock the Modal component
jest.mock('@/components/ui/Modal', () => {
  return function MockModal({
    isOpen,
    children,
    title,
  }: {
    isOpen: boolean
    children: React.ReactNode
    title?: string
  }) {
    if (!isOpen) return null
    return (
      <div data-testid="modal" data-title={title}>
        {children}
      </div>
    )
  }
})

// Mock NextImage
jest.mock('next/image', () => ({
  __esModule: true,
  default: function MockImage({ src, alt }: { src: string; alt: string }) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} data-testid="next-image" />
  },
}))

describe('ExecutionResultsModal', () => {
  const mockOnClose = jest.fn()

  const createMockResult = (
    overrides?: Partial<WorkflowExecutionResult>
  ): WorkflowExecutionResult => ({
    success: true,
    workflow_outputs: {},
    node_results: [
      {
        node_id: 'node-1',
        node_type: 'TextGeneration',
        status: 'completed',
        outputs: {},
        error: null,
        execution_time_ms: 100,
      },
    ],
    total_execution_time_ms: 100,
    error: null,
    persistence_warning: null,
    ...overrides,
  })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Persistence Warning Display', () => {
    it('should display persistence warning when present', () => {
      const result = createMockResult({
        persistence_warning: 'Execution saved without run outputs due to a logging issue.',
      })

      render(
        <ExecutionResultsModal
          isOpen={true}
          onClose={mockOnClose}
          result={result}
        />
      )

      expect(
        screen.getByText('Execution saved without run outputs due to a logging issue.')
      ).toBeInTheDocument()
      expect(screen.getByText('Persistence Warning')).toBeInTheDocument()
    })

    it('should NOT display persistence warning when null', () => {
      const result = createMockResult({
        persistence_warning: null,
      })

      render(
        <ExecutionResultsModal
          isOpen={true}
          onClose={mockOnClose}
          result={result}
        />
      )

      expect(screen.queryByText('Persistence Warning')).not.toBeInTheDocument()
    })

    it('should NOT display persistence warning when undefined', () => {
      const result = createMockResult({
        persistence_warning: undefined,
      })

      render(
        <ExecutionResultsModal
          isOpen={true}
          onClose={mockOnClose}
          result={result}
        />
      )

      expect(screen.queryByText('Persistence Warning')).not.toBeInTheDocument()
    })

    it('should display persistence warning with correct styling', () => {
      const result = createMockResult({
        persistence_warning: 'Run outputs were too large to persist.',
      })

      render(
        <ExecutionResultsModal
          isOpen={true}
          onClose={mockOnClose}
          result={result}
        />
      )

      // Find the outer container div that has the amber background
      const warningText = screen.getByText('Persistence Warning')
      const warningContainer = warningText.closest('.bg-amber-50')
      expect(warningContainer).toBeInTheDocument()
      expect(warningContainer).toHaveClass('border-amber-200')
    })

    it('should display persistence warning text with correct styling', () => {
      const warningText = 'Run completed, but outputs could not be persisted.'
      const result = createMockResult({
        persistence_warning: warningText,
      })

      render(
        <ExecutionResultsModal
          isOpen={true}
          onClose={mockOnClose}
          result={result}
        />
      )

      const warningTextElement = screen.getByText(warningText)
      expect(warningTextElement).toBeInTheDocument()
      expect(warningTextElement.closest('div')).toHaveClass('text-amber-700')
      expect(warningTextElement.closest('div')).toHaveClass('bg-amber-100/50')
    })

    it('should display persistence warning after error message when both are present', () => {
      const result = createMockResult({
        error: 'Workflow execution failed',
        persistence_warning: 'Execution saved without run outputs.',
      })

      render(
        <ExecutionResultsModal
          isOpen={true}
          onClose={mockOnClose}
          result={result}
        />
      )

      const errorElement = screen.getByText('Execution Error')
      const warningElement = screen.getByText('Persistence Warning')

      // Check that warning comes after error in the DOM
      expect(
        errorElement.compareDocumentPosition(warningElement) &
          Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy()
    })

    it('should display persistence warning before workflow outputs when both are present', () => {
      const result = createMockResult({
        success: true,
        workflow_outputs: { output1: 'value1' },
        persistence_warning: 'Outputs were too large to persist.',
      })

      const { container } = render(
        <ExecutionResultsModal
          isOpen={true}
          onClose={mockOnClose}
          result={result}
        />
      )

      // Check that warning comes before outputs in the DOM
      // Get the HTML content and check the order
      const htmlContent = container.innerHTML
      const warningIndex = htmlContent.indexOf('Persistence Warning')
      const outputsIndex = htmlContent.indexOf('Workflow Outputs')
      
      expect(warningIndex).toBeGreaterThan(-1)
      expect(outputsIndex).toBeGreaterThan(-1)
      expect(warningIndex).toBeLessThan(outputsIndex)
    })

    it('should display persistence warning even when workflow execution succeeded', () => {
      const result = createMockResult({
        success: true,
        persistence_warning: 'Execution completed but could not be saved to history.',
      })

      render(
        <ExecutionResultsModal
          isOpen={true}
          onClose={mockOnClose}
          result={result}
        />
      )

      expect(
        screen.getByText('Execution completed but could not be saved to history.')
      ).toBeInTheDocument()
      expect(screen.getByText('Persistence Warning')).toBeInTheDocument()
    })

    it('should display persistence warning even when workflow execution failed', () => {
      const result = createMockResult({
        success: false,
        error: 'Workflow failed',
        persistence_warning: 'Execution failed and could not be saved.',
      })

      render(
        <ExecutionResultsModal
          isOpen={true}
          onClose={mockOnClose}
          result={result}
        />
      )

      expect(
        screen.getByText('Execution failed and could not be saved.')
      ).toBeInTheDocument()
      expect(screen.getByText('Persistence Warning')).toBeInTheDocument()
    })
  })

  describe('Integration with other modal content', () => {
    it('should display persistence warning alongside other result information', () => {
      const result = createMockResult({
        success: true,
        workflow_outputs: { test: 'output' },
        node_results: [
          {
            node_id: 'node-1',
            node_type: 'TextGeneration',
            status: 'completed',
            outputs: { result: 'test' },
            error: null,
            execution_time_ms: 150,
          },
        ],
        total_execution_time_ms: 200,
        persistence_warning: 'Warning message',
      })

      render(
        <ExecutionResultsModal
          isOpen={true}
          onClose={mockOnClose}
          result={result}
        />
      )

      // Verify all expected elements are present
      expect(screen.getByText('Success')).toBeInTheDocument()
      expect(screen.getByText('Persistence Warning')).toBeInTheDocument()
      expect(screen.getByText('Warning message')).toBeInTheDocument()
      expect(screen.getByText('Workflow Outputs')).toBeInTheDocument()
      expect(screen.getByText('Node Execution Details')).toBeInTheDocument()
    })
  })
})
