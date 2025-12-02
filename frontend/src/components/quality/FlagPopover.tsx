'use client';

import React, { useState } from 'react';
import { QualityFlag, FLAG_TYPE_CONFIG } from '@/types/quality';
import { Check, Pencil, BookOpen, RefreshCw, X } from 'lucide-react';

interface FlagPopoverProps {
  flag: QualityFlag;
  position: { x: number; y: number };
  onApprove: () => void;
  onEdit: (newText: string) => void;
  onSetStandard: (term: string, correction: string) => void;
  onRegenerate: () => void;
  onClose: () => void;
  isEditable?: boolean;
}

export const FlagPopover: React.FC<FlagPopoverProps> = ({
  flag,
  position,
  onApprove,
  onEdit,
  onSetStandard,
  onRegenerate,
  onClose,
  isEditable = false,
}) => {
  const [mode, setMode] = useState<'actions' | 'edit' | 'standard'>('actions');
  const [editText, setEditText] = useState(flag.text); // Always start with current text
  const [standardCorrection, setStandardCorrection] = useState(flag.suggestion || flag.text);

  const config = FLAG_TYPE_CONFIG[flag.type];
  const isEdited = flag.status === 'edited';

  const handleEditSubmit = () => {
    if (editText.trim() && editText !== flag.text) {
      onEdit(editText.trim());
    }
  };

  const handleStandardSubmit = () => {
    if (standardCorrection.trim()) {
      onSetStandard(flag.text.toLowerCase(), standardCorrection.trim());
    }
  };

  return (
    <div
      className="absolute z-50 animate-in fade-in-0 zoom-in-95 duration-150"
      style={{
        left: position.x,
        top: position.y,
        transform: 'translateX(-50%)',
      }}
    >
      {/* Arrow */}
      <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-0 h-0 border-l-8 border-r-8 border-b-8 border-transparent border-b-white" />
      
      <div className="bg-white rounded-xl shadow-xl border border-gray-200 w-80 overflow-hidden">
        {/* Header */}
        <div className={`px-4 py-3 border-b border-gray-100 flex items-center justify-between ${isEdited ? 'bg-green-100' : config.bgColor}`}>
          <div className="flex items-center gap-2">
            <span className="text-lg">{isEdited ? '✓' : config.icon}</span>
            <span className={`font-medium text-sm ${isEdited ? 'text-green-700' : config.color}`}>
              {isEdited ? 'Previously Edited' : config.label}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {mode === 'actions' && (
            <>
              {/* Flagged text display */}
              <div className="mb-3">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
                  {isEdited ? 'Current Text' : 'Flagged Text'}
                </p>
                <p className={`font-medium rounded-lg px-3 py-2 text-sm ${isEdited ? 'text-green-800 bg-green-50' : 'text-gray-900 bg-gray-50'}`}>
                  &ldquo;{flag.text}&rdquo;
                </p>
              </div>

              {/* AI Reasoning - only show for pending flags */}
              {!isEdited && (
                <div className="mb-3">
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">AI Reasoning</p>
                  <p className="text-sm text-gray-700 leading-relaxed">{flag.reasoning}</p>
                </div>
              )}

              {/* Status note for edited flags */}
              {isEdited && (
                <div className="mb-3 p-2 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-xs text-green-700">
                    ✓ You&apos;ve already edited this. Click below to change it again.
                  </p>
                </div>
              )}

              {/* AI Suggestion - only show for pending flags */}
              {!isEdited && flag.suggestion && (
                <div className="mb-4">
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Suggested Correction</p>
                  <p className="font-medium text-green-700 bg-green-50 rounded-lg px-3 py-2 text-sm">
                    &ldquo;{flag.suggestion}&rdquo;
                  </p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="space-y-2">
                {/* For edited flags, show Re-edit prominently */}
                {isEdited ? (
                  <>
                    <button
                      onClick={() => setMode('edit')}
                      className="w-full flex items-center gap-3 px-4 py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg transition-colors text-sm font-medium"
                    >
                      <Pencil size={16} />
                      <div className="text-left">
                        <p>Edit Again</p>
                        <p className="text-xs text-blue-600 font-normal">Change your edit</p>
                      </div>
                    </button>

                    <button
                      onClick={onApprove}
                      className="w-full flex items-center gap-3 px-4 py-2.5 bg-green-50 hover:bg-green-100 text-green-700 rounded-lg transition-colors text-sm font-medium"
                    >
                      <Check size={16} />
                      <div className="text-left">
                        <p>Mark as Final</p>
                        <p className="text-xs text-green-600 font-normal">Lock this edit</p>
                      </div>
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={onApprove}
                      className="w-full flex items-center gap-3 px-4 py-2.5 bg-green-50 hover:bg-green-100 text-green-700 rounded-lg transition-colors text-sm font-medium"
                    >
                      <Check size={16} />
                      <div className="text-left">
                        <p>Approve as Correct</p>
                        <p className="text-xs text-green-600 font-normal">Text is correct</p>
                      </div>
                    </button>

                    <button
                      onClick={() => setMode('edit')}
                      className="w-full flex items-center gap-3 px-4 py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg transition-colors text-sm font-medium"
                    >
                      <Pencil size={16} />
                      <div className="text-left">
                        <p>Manual Edit</p>
                        <p className="text-xs text-blue-600 font-normal">Fix it yourself</p>
                      </div>
                    </button>

                    <button
                      onClick={() => setMode('standard')}
                      className="w-full flex items-center gap-3 px-4 py-2.5 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg transition-colors text-sm font-medium"
                    >
                      <BookOpen size={16} />
                      <div className="text-left">
                        <p>Set Standard Term</p>
                        <p className="text-xs text-purple-600 font-normal">Apply project-wide</p>
                      </div>
                    </button>

                    <button
                      onClick={onRegenerate}
                      className="w-full flex items-center gap-3 px-4 py-2.5 bg-orange-50 hover:bg-orange-100 text-orange-700 rounded-lg transition-colors text-sm font-medium"
                    >
                      <RefreshCw size={16} />
                      <div className="text-left">
                        <p>Request Regeneration</p>
                        <p className="text-xs text-orange-600 font-normal">Get a new version</p>
                      </div>
                    </button>
                  </>
                )}
              </div>
            </>
          )}

          {mode === 'edit' && (
            <>
              <div className="mb-4">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Edit Text</p>
                <input
                  type="text"
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  autoFocus
                />
                <p className="text-xs text-gray-500 mt-1">
                  Original: &ldquo;{flag.text}&rdquo;
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setMode('actions')}
                  className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleEditSubmit}
                  disabled={!editText.trim() || editText === flag.text}
                  className="flex-1 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Apply Edit
                </button>
              </div>
            </>
          )}

          {mode === 'standard' && (
            <>
              <div className="mb-4">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Set Standard Spelling</p>
                <div className="bg-gray-50 rounded-lg p-3 mb-3">
                  <p className="text-xs text-gray-500 mb-1">When AI sees:</p>
                  <p className="font-medium text-gray-900">&ldquo;{flag.text}&rdquo;</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Always use:</p>
                  <input
                    type="text"
                    value={standardCorrection}
                    onChange={(e) => setStandardCorrection(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    autoFocus
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setMode('actions')}
                  className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleStandardSubmit}
                  disabled={!standardCorrection.trim()}
                  className="flex-1 px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Set Standard
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default FlagPopover;


