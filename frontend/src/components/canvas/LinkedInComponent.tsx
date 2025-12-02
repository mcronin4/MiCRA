'use client';

import React from 'react';
import { MessageCircle, Send, Share2, MoreHorizontal, ThumbsUp, AlertCircle } from 'lucide-react';
import { QualityFlag } from '@/types/quality';
import { FlaggedText } from '@/components/quality/FlaggedText';

interface LinkedInNodeData {
  content?: string;
  label?: string;
  flags?: QualityFlag[];
  isChecking?: boolean;
  onApproveFlag?: (flagId: string) => void;
  onEditFlag?: (flagId: string, newText: string) => void;
  onSetStandard?: (flagId: string, term: string, correction: string) => void;
  onRequestRegeneration?: (flagId: string) => void;
}

export function LinkedInComponent({ data }: { data: LinkedInNodeData }) {
  const content = data?.content || "Proud to introduce the brilliant people behind Micra. We're a tight-knit crew of builders, researchers, and problem-solvers obsessed with crafting elegant solutions to complex problems.";
  const flags = data?.flags || [];
  const isChecking = data?.isChecking || false;
  const pendingFlagsCount = flags.filter(f => f.status === 'pending').length;

  // Default handlers if not provided
  const handleApprove = data?.onApproveFlag || (() => {});
  const handleEdit = data?.onEditFlag || (() => {});
  const handleSetStandard = data?.onSetStandard || (() => {});
  const handleRegenerate = data?.onRequestRegeneration || (() => {});
  
  return (
    <div className="w-[500px] bg-white p-5 rounded-xl shadow-md relative">
      {/* Flag count badge */}
      {pendingFlagsCount > 0 && (
        <div className="absolute -top-2 -right-2 bg-amber-500 text-white text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1 shadow-md">
          <AlertCircle size={12} />
          {pendingFlagsCount}
        </div>
      )}
      
      {/* Checking indicator */}
      {isChecking && (
        <div className="absolute -top-2 -right-2 bg-blue-500 text-white text-xs font-medium px-3 py-1 rounded-full animate-pulse">
          Checking...
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center">
          <div className="w-12 h-12 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full mr-3 flex items-center justify-center text-white font-bold">
            M
          </div>
          <div>
            <p className="font-bold text-sm">MICRA Team</p>
            <p className="text-xs text-gray-500">AI Content Assistant</p>
            <p className="text-xs text-gray-500">Just now · <span>🌍</span></p>
          </div>
        </div>
        <MoreHorizontal className="text-gray-500 cursor-pointer hover:bg-gray-100 rounded p-1" />
      </div>

      <div className="text-sm mb-4">
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
          <p className="whitespace-pre-wrap leading-relaxed">{content}</p>
        )}
      </div>

      <div className="flex justify-around text-sm text-gray-600 mt-4 pt-2 border-t">
        <button className="flex items-center space-x-2 hover:bg-gray-100 p-2 rounded-lg transition-colors">
          <ThumbsUp size={20}/> <span>Like</span>
        </button>
        <button className="flex items-center space-x-2 hover:bg-gray-100 p-2 rounded-lg transition-colors">
          <MessageCircle size={20}/> <span>Comment</span>
        </button>
        <button className="flex items-center space-x-2 hover:bg-gray-100 p-2 rounded-lg transition-colors">
          <Share2 size={20}/> <span>Share</span>
        </button>
        <button className="flex items-center space-x-2 hover:bg-gray-100 p-2 rounded-lg transition-colors">
          <Send size={20}/> <span>Send</span>
        </button>
      </div>
    </div>
  );
}
