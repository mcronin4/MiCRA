"use client";

import React from "react";
import {
  MousePointer2,
  Hand,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  MessageCircle,
  Play,
  Loader2,
  Eye,
  Square,
} from "lucide-react";
import type { ReactFlowInstance } from "@xyflow/react";

type InteractionMode = "select" | "pan";

interface ExecutionBarProps {
  reactFlowInstance: ReactFlowInstance | null;
  onChatToggle?: () => void;
  isChatOpen?: boolean;
  showChatToggle?: boolean;
  onExecuteWorkflow?: () => void;
  interactionMode: InteractionMode;
  onInteractionModeChange: (mode: InteractionMode) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  isExecuting?: boolean;
  executionJustCompleted?: boolean;
  currentWorkflowId?: string;
  onViewResults?: () => void;
  onCancelExecution?: () => void;
}

export const ExecutionBar: React.FC<ExecutionBarProps> = ({
  reactFlowInstance,
  onChatToggle,
  isChatOpen = false,
  showChatToggle = true,
  onExecuteWorkflow,
  interactionMode,
  onInteractionModeChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  isExecuting = false,
  executionJustCompleted = false,
  currentWorkflowId,
  onViewResults,
  onCancelExecution,
}) => {
  const showViewResults =
    executionJustCompleted && currentWorkflowId && onViewResults;
  return (
    <div className="h-14 bg-white border-t border-gray-100 flex items-center justify-between px-4">
      {/* Left Controls */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => onInteractionModeChange("select")}
          className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors ${
            interactionMode === "select"
              ? "bg-gray-100 text-gray-800"
              : "hover:bg-gray-100 text-gray-600"
          }`}
          title="Select Mode"
        >
          <MousePointer2 size={18} />
        </button>
        <button
          onClick={() => onInteractionModeChange("pan")}
          className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors ${
            interactionMode === "pan"
              ? "bg-gray-100 text-gray-800"
              : "hover:bg-gray-100 text-gray-600"
          }`}
          title="Pan Mode"
        >
          <Hand size={18} />
        </button>
        <div className="w-px h-6 bg-gray-200 mx-1" />
        <button
          onClick={onUndo}
          disabled={!canUndo}
          className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors ${
            canUndo
              ? "hover:bg-gray-100 text-gray-600"
              : "text-gray-300 cursor-not-allowed"
          }`}
          title="Undo"
        >
          <Undo2 size={18} />
        </button>
        <button
          onClick={onRedo}
          disabled={!canRedo}
          className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors ${
            canRedo
              ? "hover:bg-gray-100 text-gray-600"
              : "text-gray-300 cursor-not-allowed"
          }`}
          title="Redo"
        >
          <Redo2 size={18} />
        </button>
      </div>

      {/* Center Controls - Zoom */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => reactFlowInstance?.zoomOut()}
          className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors text-gray-600"
          title="Zoom Out"
        >
          <ZoomOut size={18} />
        </button>
        <button
          onClick={() => reactFlowInstance?.zoomIn()}
          className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors text-gray-600"
          title="Zoom In"
        >
          <ZoomIn size={18} />
        </button>
        <button
          onClick={() => reactFlowInstance?.fitView()}
          className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors text-gray-600"
          title="Fit View"
        >
          <Maximize2 size={18} />
        </button>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-2">
        {showChatToggle && (
          <>
            <button
              onClick={onChatToggle}
              className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors ${
                isChatOpen
                  ? "bg-gray-100 text-gray-800"
                  : "hover:bg-gray-100 text-gray-600"
              }`}
              title="AI Chat"
            >
              <MessageCircle size={18} />
            </button>
            <div className="w-px h-6 bg-gray-200 mx-1" />
          </>
        )}
        {showViewResults && (
          <button
            onClick={onViewResults}
            className="h-9 px-4 flex items-center gap-2 rounded-lg font-medium text-sm bg-indigo-500 hover:bg-indigo-600 text-white shadow-sm hover:shadow-md transition-all"
          >
            <Eye size={14} />
            <span>View Results</span>
          </button>
        )}
        {isExecuting ? (
          <button
            onClick={onCancelExecution}
            className="h-9 px-4 flex items-center gap-2 rounded-lg font-medium text-sm transition-all bg-rose-500 hover:bg-rose-600 text-white shadow-sm hover:shadow-md"
          >
            <Loader2 size={14} className="animate-spin" />
            <span>Running...</span>
            <Square size={12} fill="currentColor" />
            <span>Stop</span>
          </button>
        ) : (
          <button
            onClick={onExecuteWorkflow}
            className="h-9 px-4 flex items-center gap-2 rounded-lg font-medium text-sm transition-all bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm hover:shadow-md"
          >
            <Play size={14} fill="currentColor" />
            <span>Execute</span>
          </button>
        )}
      </div>
    </div>
  );
};
