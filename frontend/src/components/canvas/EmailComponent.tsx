'use client';

import React from 'react';
import { AlertCircle } from 'lucide-react';
import { QualityFlag } from '@/types/quality';
import { FlaggedText } from '@/components/quality/FlaggedText';

interface EmailNodeData {
  content?: string;
  subject?: string;
  to?: string;
  label?: string;
  flags?: QualityFlag[];
  isChecking?: boolean;
  onApproveFlag?: (flagId: string) => void;
  onEditFlag?: (flagId: string, newText: string) => void;
  onSetStandard?: (flagId: string, term: string, correction: string) => void;
  onRequestRegeneration?: (flagId: string) => void;
}

export function EmailComponent({ data }: { data: EmailNodeData }) {
  const content = data?.content || `Hi [First Name],

I'm excited to introduce the brilliant people behind Micra—a tight-knit crew of builders, researchers, and problem-solvers obsessed with crafting elegant solutions to complex problems.

Best regards,
[Your Name]`;

  const subject = data?.subject || "Meet the Team Behind Micra";
  const to = data?.to || "marketing-leads@example.com";
  const flags = data?.flags || [];
  const isChecking = data?.isChecking || false;
  const pendingFlagsCount = flags.filter(f => f.status === 'pending').length;

  // Default handlers if not provided
  const handleApprove = data?.onApproveFlag || (() => {});
  const handleEdit = data?.onEditFlag || (() => {});
  const handleSetStandard = data?.onSetStandard || (() => {});
  const handleRegenerate = data?.onRequestRegeneration || (() => {});

  return (
    <div className="w-[500px] bg-white rounded-xl shadow-lg font-sans relative">
      {/* Flag count badge */}
      {pendingFlagsCount > 0 && (
        <div className="absolute -top-2 -right-2 bg-amber-500 text-white text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1 shadow-md z-10">
          <AlertCircle size={12} />
          {pendingFlagsCount}
        </div>
      )}
      
      {/* Checking indicator */}
      {isChecking && (
        <div className="absolute -top-2 -right-2 bg-blue-500 text-white text-xs font-medium px-3 py-1 rounded-full animate-pulse z-10">
          Checking...
        </div>
      )}

      {/* Header */}
      <div className="bg-gray-100 p-3 rounded-t-xl border-b border-gray-200 flex items-center justify-between">
        <h3 className="font-semibold text-gray-700">Compose Email</h3>
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 rounded-full bg-red-400"></div>
          <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
          <div className="w-3 h-3 rounded-full bg-green-400"></div>
        </div>
      </div>

      {/* Email Meta */}
      <div className="p-4 text-sm text-gray-600">
        <div className="flex items-center mb-2">
          <span className="font-semibold w-16">To:</span>
          <span className="bg-gray-100 rounded-full px-3 py-1 text-xs">{to}</span>
        </div>
        <div className="flex items-center">
          <span className="font-semibold w-16">Subject:</span>
          <span className="font-medium text-gray-800">{subject}</span>
        </div>
      </div>

      {/* Email Body */}
      <div className="p-4 border-t border-gray-200 text-sm text-gray-800 leading-relaxed">
        {flags.length > 0 ? (
          <FlaggedText
            content={content}
            flags={flags}
            onApproveFlag={handleApprove}
            onEditFlag={handleEdit}
            onSetStandard={handleSetStandard}
            onRequestRegeneration={handleRegenerate}
          />
        ) : (
          <p className="whitespace-pre-wrap">{content}</p>
        )}
      </div>
    </div>
  );
}
