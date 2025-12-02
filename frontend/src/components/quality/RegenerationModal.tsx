'use client';

import React, { useState, useEffect, useRef } from 'react';
import { X, RefreshCw, Lightbulb } from 'lucide-react';

interface RegenerationModalProps {
  isOpen: boolean;
  nodeType: 'LinkedIn' | 'Email' | 'TikTok';
  originalContent: string;
  flaggedText?: string;
  onRegenerate: (feedback: string) => void;
  onClose: () => void;
}

const FEEDBACK_SUGGESTIONS: Record<string, string[]> = {
  LinkedIn: [
    'Make it more professional and formal',
    'Add more industry-specific insights',
    'Include a stronger call-to-action',
    'Make it more concise',
    'Add relevant hashtags',
  ],
  Email: [
    'Make the tone warmer and more personable',
    'Shorten the email significantly',
    'Add more specific details',
    'Make the subject line more compelling',
    'Adjust the greeting/closing',
  ],
  TikTok: [
    'Make it more casual and trendy',
    'Add a hook at the beginning',
    'Include popular sounds/trends references',
    'Make it shorter for better engagement',
    'Add more energy and excitement',
  ],
};

export const RegenerationModal: React.FC<RegenerationModalProps> = ({
  isOpen,
  nodeType,
  originalContent,
  flaggedText,
  onRegenerate,
  onClose,
}) => {
  const [feedback, setFeedback] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Focus textarea when modal opens
  useEffect(() => {
    if (isOpen && textareaRef.current) {
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setFeedback('');
      setIsSubmitting(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const suggestions = FEEDBACK_SUGGESTIONS[nodeType] || [];

  const handleSubmit = async () => {
    if (!feedback.trim()) return;
    
    setIsSubmitting(true);
    await onRegenerate(feedback.trim());
    setIsSubmitting(false);
  };

  const handleSuggestionClick = (suggestion: string) => {
    setFeedback(prev => {
      if (prev.trim()) {
        return `${prev.trim()}. ${suggestion}`;
      }
      return suggestion;
    });
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.metaKey && feedback.trim()) {
      handleSubmit();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden animate-in fade-in-0 zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 rounded-lg">
              <RefreshCw size={20} className="text-orange-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">Regenerate {nodeType} Content</h2>
              <p className="text-xs text-gray-500">Provide feedback for the AI to improve</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Original content preview */}
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Current Content</p>
            <div className="bg-gray-50 rounded-lg p-3 max-h-32 overflow-y-auto">
              <p className="text-sm text-gray-700 whitespace-pre-wrap line-clamp-4">
                {originalContent}
              </p>
            </div>
          </div>

          {/* Flagged text context */}
          {flaggedText && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-xs text-amber-700 font-medium mb-1">Issue with:</p>
              <p className="text-sm text-amber-800">&ldquo;{flaggedText}&rdquo;</p>
            </div>
          )}

          {/* Feedback input */}
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">
              What should be different?
            </p>
            <textarea
              ref={textareaRef}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe the changes you want..."
              className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent resize-none"
              rows={3}
            />
            <p className="text-xs text-gray-400 mt-1">
              Press ⌘+Enter to submit
            </p>
          </div>

          {/* Quick suggestions */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Lightbulb size={14} className="text-amber-500" />
              <p className="text-xs text-gray-500 uppercase tracking-wide">Quick Suggestions</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((suggestion, index) => (
                <button
                  key={index}
                  onClick={() => handleSuggestionClick(suggestion)}
                  className="text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-full transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 bg-gray-50 border-t border-gray-100">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!feedback.trim() || isSubmitting}
            className="px-5 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isSubmitting ? (
              <>
                <RefreshCw size={14} className="animate-spin" />
                Regenerating...
              </>
            ) : (
              <>
                <RefreshCw size={14} />
                Regenerate
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default RegenerationModal;


