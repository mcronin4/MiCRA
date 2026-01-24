"use client";

import React, { useState } from "react";
import { Save, FolderOpen } from "lucide-react";

interface TopNavBarProps {
  workflowName?: string;
  onWorkflowNameChange?: (name: string) => void;
  onSave?: () => void;
  onLoad?: () => void;
  canSave?: boolean;
}

export const TopNavBar: React.FC<TopNavBarProps> = ({
  workflowName = "Untitled Workflow",
  onWorkflowNameChange,
  onSave,
  onLoad,
  canSave = true,
}) => {
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(workflowName);

  const handleNameSubmit = () => {
    setIsEditingName(false);
    if (onWorkflowNameChange && editedName.trim()) {
      onWorkflowNameChange(editedName.trim());
    }
  };

  return (
    <div className="h-12 bg-white border-b border-gray-100 flex items-center justify-between px-4">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <span className="text-gray-400">My Projects</span>
        <span className="text-gray-300">/</span>
        {isEditingName ? (
          <input
            type="text"
            value={editedName}
            onChange={(e) => setEditedName(e.target.value)}
            onBlur={handleNameSubmit}
            onKeyDown={(e) => e.key === "Enter" && handleNameSubmit()}
            className="px-2 py-1 text-sm font-medium text-gray-800 bg-gray-50 border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-emerald-500"
            autoFocus
          />
        ) : (
          <button
            onClick={() => setIsEditingName(true)}
            className="font-medium text-gray-800 hover:text-gray-600 transition-colors"
          >
            {workflowName}
          </button>
        )}
      </div>

      {/* Right - Save/Load Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={onSave}
          disabled={!canSave}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
            canSave
              ? "bg-emerald-500 hover:bg-emerald-600 text-white"
              : "bg-gray-100 text-gray-400 cursor-not-allowed"
          }`}
        >
          <Save size={14} />
          Save
        </button>
        <button
          onClick={onLoad}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200"
        >
          <FolderOpen size={14} />
          Load
        </button>
      </div>
    </div>
  );
};
