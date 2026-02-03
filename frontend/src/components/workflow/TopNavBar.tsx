"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Save, FolderOpen, Eye } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkflowStore } from "@/lib/stores/workflowStore";
import type { User } from "@supabase/supabase-js";

interface TopNavBarProps {
  onSave?: () => void;
  onLoad?: () => void;
  canSave?: boolean;
}

/** Prefer full_name (Google), then name, display_name, user_name, username (Magic Link). */
function displayNameFromUser(user: User | null): string | null {
  if (!user?.user_metadata) return null;
  const m = user.user_metadata as Record<string, unknown>;
  const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return (
    s(m.full_name) ??
    s(m.name) ??
    s(m.display_name) ??
    s(m.user_name) ??
    s(m.username) ??
    null
  );
}

export const TopNavBar: React.FC<TopNavBarProps> = ({
  onSave,
  onLoad,
  canSave = true,
}) => {
  const workflowName = useWorkflowStore((state) => state.workflowName);
  const setWorkflowName = useWorkflowStore((state) => state.setWorkflowName);
  const currentWorkflowId = useWorkflowStore((state) => state.currentWorkflowId);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(workflowName);

  // Sync editedName when workflowName from store changes (e.g., when loading a workflow)
  useEffect(() => {
    if (!isEditingName) {
      setEditedName(workflowName);
    }
  }, [workflowName, isEditingName]);
  const { user } = useAuth();
  const displayName = displayNameFromUser(user);
  const projectsLabel = user && displayName ? `${displayName}'s Projects` : "My Projects";

  const handleNameSubmit = () => {
    setIsEditingName(false);
    if (editedName.trim()) {
      setWorkflowName(editedName.trim());
    }
  };

  return (
    <div className="h-12 bg-white border-b border-gray-100 flex items-center justify-between px-4">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <span className="text-gray-400">{projectsLabel}</span>
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

      {/* Right - Preview + Save/Load Actions */}
      <div className="flex items-center gap-2">
        {currentWorkflowId && (
          <Link
            href={`/preview/${currentWorkflowId}`}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors border border-indigo-200"
          >
            <Eye size={14} />
            Preview
          </Link>
        )}
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
