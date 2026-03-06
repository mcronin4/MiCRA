"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Save, LayoutDashboard, Eye, History, Clock, Loader2, ChevronDown } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkflowStore } from "@/lib/stores/workflowStore";
import { listWorkflowVersions, type WorkflowVersionMetadata } from "@/lib/fastapi/workflows";
import { showToast } from "@/lib/stores/toastStore";
import type { User } from "@supabase/supabase-js";

interface TopNavBarProps {
  onSave?: () => void;
  canSave?: boolean;
  onRestoreVersion?: (versionNumber: number) => void;
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

const PREVIEW_BTN_CLASS =
  "flex items-center gap-1.5 px-3 py-1.5 text-sm text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors border border-indigo-200";

export const TopNavBar: React.FC<TopNavBarProps> = ({
  onSave,
  canSave = true,
  onRestoreVersion,
}) => {
  const router = useRouter();
  const workflowName = useWorkflowStore((state) => state.workflowName);
  const setWorkflowName = useWorkflowStore((state) => state.setWorkflowName);
  const currentWorkflowId = useWorkflowStore((state) => state.currentWorkflowId);
  const isDirty = useWorkflowStore((state) => state.isDirty);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(workflowName);

  const [showVersionDropdown, setShowVersionDropdown] = useState(false);
  const [versions, setVersions] = useState<WorkflowVersionMetadata[]>([]);
  const [isLoadingVersions, setIsLoadingVersions] = useState(false);
  const [restoringVersion, setRestoringVersion] = useState<number | null>(null);
  // null = canvas reflects the latest saved version; number = a specific restored version
  const [activeVersionNumber, setActiveVersionNumber] = useState<number | null>(null);
  const prevIsDirtyRef = useRef(isDirty);
  const versionDropdownRef = useRef<HTMLDivElement>(null);

  // After a save (isDirty transitions true→false), the restored content is now
  // the latest version, so reset back to "latest".
  useEffect(() => {
    if (prevIsDirtyRef.current && !isDirty) {
      setActiveVersionNumber(null);
    }
    prevIsDirtyRef.current = isDirty;
  }, [isDirty]);

  // Reset when switching to a different workflow
  useEffect(() => {
    setActiveVersionNumber(null);
  }, [currentWorkflowId]);

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

  const handleNavigateDashboard = (e: React.MouseEvent) => {
    if (isDirty && !window.confirm("You have unsaved changes. Leave the editor? Your changes will be lost.")) {
      e.preventDefault();
    }
  };

  const handleToggleVersionDropdown = useCallback(async () => {
    if (showVersionDropdown) {
      setShowVersionDropdown(false);
      return;
    }
    if (!currentWorkflowId) return;

    setShowVersionDropdown(true);
    setIsLoadingVersions(true);
    try {
      const versionList = await listWorkflowVersions(currentWorkflowId);
      setVersions(versionList);
    } catch {
      showToast("Failed to load version history", "error");
      setShowVersionDropdown(false);
    } finally {
      setIsLoadingVersions(false);
    }
  }, [showVersionDropdown, currentWorkflowId]);

  const handleRestoreVersion = useCallback(async (versionNumber: number) => {
    if (!onRestoreVersion) return;
    if (activeVersionNumber === versionNumber) return;
    if (isDirty && !window.confirm(`You have unsaved changes. Restore version ${versionNumber}? Your changes will be lost.`)) {
      return;
    }
    setRestoringVersion(versionNumber);
    try {
      await onRestoreVersion(versionNumber);
      setActiveVersionNumber(versionNumber);
      setShowVersionDropdown(false);
    } finally {
      setRestoringVersion(null);
    }
  }, [onRestoreVersion, isDirty, activeVersionNumber]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!showVersionDropdown) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (versionDropdownRef.current && !versionDropdownRef.current.contains(e.target as Node)) {
        setShowVersionDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showVersionDropdown]);

  return (
    <div className="h-12 bg-white border-b border-gray-100 flex items-center justify-between px-4">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <Link href="/dashboard" onClick={handleNavigateDashboard} className="text-gray-400 hover:text-indigo-600 transition-colors">
          {projectsLabel}
        </Link>
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

      {/* Right - Version History + Preview + Save/Load Actions */}
      <div className="flex items-center gap-2">
        {currentWorkflowId && (
          <div className="relative" ref={versionDropdownRef}>
            <button
              type="button"
              onClick={handleToggleVersionDropdown}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors border ${
                showVersionDropdown
                  ? "bg-gray-100 text-gray-800 border-gray-300"
                  : "text-gray-600 hover:bg-gray-50 border-gray-200"
              }`}
              title="Version history"
            >
              <History size={14} />
              Versions
              <ChevronDown size={12} className={`transition-transform ${showVersionDropdown ? "rotate-180" : ""}`} />
            </button>

            {showVersionDropdown && (
              <div className="absolute right-0 top-full mt-1 w-80 bg-white rounded-lg border border-gray-200 shadow-lg z-50 overflow-hidden">
                <div className="px-3 py-2 border-b border-gray-100 bg-gray-50">
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Version History</span>
                </div>
                <div className="max-h-72 overflow-y-auto">
                  {isLoadingVersions ? (
                    <div className="flex items-center justify-center py-6 text-gray-400">
                      <Loader2 size={18} className="animate-spin mr-2" />
                      <span className="text-sm">Loading versions...</span>
                    </div>
                  ) : versions.length === 0 ? (
                    <div className="text-center py-6 text-sm text-gray-400">
                      No versions found
                    </div>
                  ) : (
                    versions.map((version, index) => {
                      const isLatest = index === 0;
                      const isActive = activeVersionNumber === null
                        ? isLatest
                        : version.version_number === activeVersionNumber;
                      const date = new Date(version.created_at);
                      const formattedDate = date.toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      });
                      const isRestoring = restoringVersion === version.version_number;

                      return (
                        <div
                          key={version.version_number}
                          className={`flex items-center justify-between px-3 py-2.5 border-b border-gray-50 last:border-b-0 transition-colors ${
                            isActive ? "bg-emerald-50/50" : "hover:bg-gray-50"
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-medium text-gray-800">
                                v{version.version_number}
                              </span>
                              {isLatest && (
                                <span className="text-[10px] font-medium bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                                  Latest
                                </span>
                              )}
                              {isActive && (
                                <span className="text-[10px] font-medium bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">
                                  On canvas{isDirty ? " (edited)" : ""}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1 text-xs text-gray-400 mt-0.5">
                              <Clock size={10} />
                              <span>{formattedDate}</span>
                              <span className="text-gray-300 mx-0.5">·</span>
                              <span>{version.node_count} nodes</span>
                            </div>
                          </div>
                          {!isActive && (
                            <button
                              type="button"
                              onClick={() => handleRestoreVersion(version.version_number)}
                              disabled={isRestoring}
                              className="ml-2 px-2.5 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 rounded transition-colors disabled:opacity-50"
                            >
                              {isRestoring ? (
                                <Loader2 size={12} className="animate-spin" />
                              ) : (
                                "Restore"
                              )}
                            </button>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        )}
        {currentWorkflowId ? (
          <button
            type="button"
            onClick={() => router.push(`/preview/${currentWorkflowId}`)}
            className={PREVIEW_BTN_CLASS}
            title="Open preview"
          >
            <Eye size={14} />
            Preview
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onSave?.()}
            className={`${PREVIEW_BTN_CLASS} opacity-80`}
            title="Save workflow first to preview"
          >
            <Eye size={14} />
            Preview
          </button>
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
        <Link
          href="/dashboard"
          onClick={handleNavigateDashboard}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200"
        >
          <LayoutDashboard size={14} />
          Return to Dashboard
        </Link>
      </div>
    </div>
  );
};
