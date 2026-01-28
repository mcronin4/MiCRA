'use client';

import Modal from '@/components/ui/Modal';
import type { WorkflowExecutionResult } from '@/types/workflow-execution';
import { CheckCircle, XCircle, Clock } from 'lucide-react';

interface ExecutionResultsModalProps {
  isOpen: boolean;
  onClose: () => void;
  result: WorkflowExecutionResult | null;
}

export function ExecutionResultsModal({
  isOpen,
  onClose,
  result,
}: ExecutionResultsModalProps) {
  if (!isOpen) return null;
  
  // Show placeholder if no result yet
  if (!result) {
    return (
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="Workflow Execution Results"
      >
        <div className="space-y-4">
          <div className="text-sm text-gray-600">
            Execution completed but no result data available.
          </div>
          <div className="flex justify-end pt-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium text-gray-700 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  const successCount = result.node_results.filter(
    (nr) => nr.status === 'completed'
  ).length;
  const errorCount = result.node_results.filter(
    (nr) => nr.status === 'error'
  ).length;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Workflow Execution Results"
    >
      <div className="space-y-4">
        {/* Summary */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-xs text-gray-500 mb-1">Status</div>
            <div className="flex items-center gap-2">
              {result.success ? (
                <>
                  <CheckCircle className="w-4 h-4 text-emerald-600" />
                  <span className="text-sm font-medium text-emerald-700">
                    Success
                  </span>
                </>
              ) : (
                <>
                  <XCircle className="w-4 h-4 text-red-600" />
                  <span className="text-sm font-medium text-red-700">
                    Failed
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-xs text-gray-500 mb-1">Duration</div>
            <div className="flex items-center gap-1">
              <Clock className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-medium">
                {result.total_execution_time_ms}ms
              </span>
            </div>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-xs text-gray-500 mb-1">Nodes</div>
            <div className="text-sm font-medium">
              {successCount} completed, {errorCount} failed
            </div>
          </div>
        </div>

        {/* Error message if failed */}
        {result.error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <div className="text-sm font-medium text-red-800 mb-1">Error</div>
            <div className="text-xs text-red-700">{result.error}</div>
          </div>
        )}

        {/* Workflow outputs */}
        {result.success && Object.keys(result.workflow_outputs).length > 0 && (
          <div>
            <div className="text-sm font-medium text-gray-700 mb-2">
              Workflow Outputs
            </div>
            <div className="bg-gray-50 rounded-lg p-3 max-h-40 overflow-auto">
              <pre className="text-xs text-gray-600 whitespace-pre-wrap">
                {JSON.stringify(result.workflow_outputs, null, 2)}
              </pre>
            </div>
          </div>
        )}

        {/* Node results */}
        <div>
          <div className="text-sm font-medium text-gray-700 mb-2">
            Node Execution Details
          </div>
          <div className="space-y-2 max-h-64 overflow-auto">
            {result.node_results.map((nr) => (
              <div
                key={nr.node_id}
                className={`border rounded-lg p-2 ${
                  nr.status === 'completed'
                    ? 'bg-emerald-50 border-emerald-200'
                    : 'bg-red-50 border-red-200'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium">{nr.node_id}</span>
                  <div className="flex items-center gap-2">
                    {nr.status === 'completed' ? (
                      <CheckCircle className="w-3 h-3 text-emerald-600" />
                    ) : (
                      <XCircle className="w-3 h-3 text-red-600" />
                    )}
                    <span className="text-xs text-gray-500">
                      {nr.execution_time_ms}ms
                    </span>
                  </div>
                </div>
                {nr.error && (
                  <div className="text-xs text-red-700 mt-1">{nr.error}</div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium text-gray-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}

