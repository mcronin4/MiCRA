'use client';

import Modal from '@/components/ui/Modal';
import type { CompilationDiagnostic } from '@/types/blueprint';
import { AlertCircle, AlertTriangle, XCircle } from 'lucide-react';

interface CompilationDiagnosticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  diagnostics: CompilationDiagnostic[];
  onProceed?: () => void;
}

export function CompilationDiagnosticsModal({
  isOpen,
  onClose,
  diagnostics,
  onProceed,
}: CompilationDiagnosticsModalProps) {
  const errors = diagnostics.filter((d) => d.level === 'error');
  const warnings = diagnostics.filter((d) => d.level === 'warning');
  const hasErrors = errors.length > 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Compilation Diagnostics"
    >
      <div className="space-y-4">
        {/* Summary */}
        <div className="flex items-center gap-4">
          {hasErrors ? (
            <div className="flex items-center gap-2 text-red-700">
              <XCircle className="w-5 h-5" />
              <span className="text-sm font-medium">
                {errors.length} error{errors.length !== 1 ? 's' : ''} found
              </span>
            </div>
          ) : warnings.length > 0 ? (
            <div className="flex items-center gap-2 text-amber-700">
              <AlertTriangle className="w-5 h-5" />
              <span className="text-sm font-medium">
                {warnings.length} warning{warnings.length !== 1 ? 's' : ''} found
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-emerald-700">
              <AlertCircle className="w-5 h-5" />
              <span className="text-sm font-medium">No issues found</span>
            </div>
          )}
        </div>

        {/* Errors */}
        {errors.length > 0 && (
          <div>
            <div className="text-sm font-medium text-red-700 mb-2">Errors</div>
            <div className="space-y-2 max-h-64 overflow-auto">
              {errors.map((diag, idx) => (
                <div
                  key={idx}
                  className="bg-red-50 border border-red-200 rounded-lg p-3"
                >
                  <div className="text-xs font-medium text-red-800 mb-1">
                    {diag.node_id ? `Node: ${diag.node_id}` : 'General'}
                    {diag.field && ` • Field: ${diag.field}`}
                  </div>
                  <div className="text-xs text-red-700">{diag.message}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Warnings */}
        {warnings.length > 0 && (
          <div>
            <div className="text-sm font-medium text-amber-700 mb-2">
              Warnings
            </div>
            <div className="space-y-2 max-h-64 overflow-auto">
              {warnings.map((diag, idx) => (
                <div
                  key={idx}
                  className="bg-amber-50 border border-amber-200 rounded-lg p-3"
                >
                  <div className="text-xs font-medium text-amber-800 mb-1">
                    {diag.node_id ? `Node: ${diag.node_id}` : 'General'}
                    {diag.field && ` • Field: ${diag.field}`}
                  </div>
                  <div className="text-xs text-amber-700">{diag.message}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium text-gray-700 transition-colors"
          >
            Close
          </button>
          {!hasErrors && onProceed && (
            <button
              onClick={() => {
                onProceed();
                onClose();
              }}
              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 rounded-lg text-sm font-medium text-white transition-colors"
            >
              Proceed with Execution
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}


