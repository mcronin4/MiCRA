"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  MoreVertical,
  ExternalLink,
  Copy,
  Trash2,
  Loader2,
} from "lucide-react";
import type { WorkflowMetadata } from "@/lib/fastapi/workflows";

interface WorkflowRowProps {
  workflow: WorkflowMetadata;
  onOpen: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}

export function WorkflowRow({
  workflow,
  onOpen,
  onDuplicate,
  onDelete,
  isDeleting,
}: WorkflowRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  const updatedDate = new Date(workflow.updated_at);
  const createdDate = new Date(workflow.created_at);

  return (
    <div
      className={`group flex items-center justify-between px-5 py-4 border border-slate-200 rounded-lg cursor-pointer transition-all hover:bg-slate-50 hover:border-slate-300 ${
        isDeleting ? "opacity-50 pointer-events-none" : ""
      }`}
      onClick={onOpen}
    >
      {/* Left: Name + metadata */}
      <div className="flex-1 min-w-0 mr-4">
        <h3 className="font-medium text-slate-800 truncate text-[15px]">
          {workflow.name}
        </h3>
        <p className="text-sm text-slate-400 mt-0.5">
          Last updated {getRelativeTime(updatedDate)} | Created{" "}
          {formatDate(createdDate)}
        </p>
      </div>

      {/* Right: Node count + context menu */}
      <div className="flex items-center gap-3 shrink-0">
        <span className="text-xs text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full font-medium">
          {workflow.node_count} node{workflow.node_count !== 1 ? "s" : ""}
        </span>

        {/* Three-dot menu */}
        <div ref={menuRef} className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((prev) => !prev);
            }}
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
          >
            {isDeleting ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <MoreVertical size={16} />
            )}
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-20">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(false);
                  onOpen();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <ExternalLink size={14} className="text-slate-400" />
                Open
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(false);
                  onDuplicate();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <Copy size={14} className="text-slate-400" />
                Duplicate
              </button>
              <div className="my-1 border-t border-slate-100" />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(false);
                  onDelete();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
              >
                <Trash2 size={14} />
                Delete
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Returns a human-readable relative time string. */
function getRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  if (diffSecs < 60) return "just now";
  const diffMins = Math.floor(diffSecs / 60);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return `${diffMonths} month${diffMonths > 1 ? "s" : ""} ago`;
  const diffYears = Math.floor(diffMonths / 12);
  return `${diffYears} year${diffYears > 1 ? "s" : ""} ago`;
}

/** Formats a date as "Oct 4, 2025". */
function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
