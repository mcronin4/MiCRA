"use client";

import React from "react";
import { NodeProps } from "@xyflow/react";
import { AlertTriangle } from "lucide-react";

/**
 * Fallback node component for unknown/unsupported node types.
 * This allows older workflows with deprecated node types to still load.
 */
function getOriginalType(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const val = (data as Record<string, unknown>).originalType;
  return typeof val === "string" && val.length > 0 ? val : null;
}

export function UnknownNode({ data }: NodeProps) {
  const nodeType = getOriginalType(data) ?? "Unknown";
  
  return (
    <div className="px-4 py-3 bg-yellow-50 border-2 border-yellow-300 rounded-lg min-w-[200px]">
      <div className="flex items-center gap-2">
        <AlertTriangle size={16} className="text-yellow-600" />
        <div>
          <div className="text-sm font-semibold text-yellow-900">
            Unknown Node Type
          </div>
          <div className="text-xs text-yellow-700 mt-0.5">
            Type: {nodeType}
          </div>
          <div className="text-xs text-yellow-600 mt-1">
            This node type is no longer supported. Please remove it or update your workflow.
          </div>
        </div>
      </div>
    </div>
  );
}

